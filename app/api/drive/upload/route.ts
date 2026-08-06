import { Readable } from "stream";
import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getDriveV3 } from "@/lib/google-drive-admin";
import { resolveExplorerUploadFolder } from "@/lib/drive/explorer-folder-guard";
import {
  assertCanAccessDriveFileId,
  loadDriveAccessActor,
} from "@/lib/drive/folder-access";
import {
  sanitizeUploadDisplayName,
  validateUploadFile,
} from "@/lib/upload-policy";
import {
  DailyUploadQuotaError,
  releaseDailyUploadBytes,
  reserveDailyUploadBytes,
} from "@/lib/upload-daily-quota";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/drive/upload
 * 탐색기 SHARED 드라이브(EXPLORER) 폴더에만 업로드.
 * GOOGLE_DRIVE_FOLDER_ID(첨부 자동저장)는 사용하지 않음.
 *
 * NOTE: 브라우저→Drive 직접 resumable PUT은 세션 Origin 불일치(CORS)로 불가.
 * 서버 경유 multipart 유지.
 */
export async function POST(req: Request) {
  let reservedBytes = 0;
  let reservedUserId: string | null = null;
  const t0 = Date.now();

  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const userId = session.user.id;

    const formData = await req.formData();
    const file = formData.get("file");
    const targetFolderIdRaw = formData.get("targetFolderId");
    const targetFolderId =
      typeof targetFolderIdRaw === "string" ? targetFolderIdRaw.trim() : "";

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "파일을 선택하세요." }, { status: 400 });
    }
    if (!targetFolderId) {
      return NextResponse.json(
        { error: "대상 폴더(targetFolderId)가 필요합니다." },
        { status: 400 }
      );
    }

    const clientCheck = validateUploadFile(file);
    if (!clientCheck.ok) {
      return NextResponse.json({ error: clientCheck.error }, { status: 400 });
    }

    const resolved = await resolveExplorerUploadFolder(targetFolderId);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const { folder, explorerRootId } = resolved;

    const actor = await loadDriveAccessActor(userId);
    if (!actor) {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 401 });
    }
    const access = await assertCanAccessDriveFileId(actor, folder.id);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const mime = (file.type || "").toLowerCase() || "application/octet-stream";
    const displayName = sanitizeUploadDisplayName(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    const tReceived = Date.now();

    try {
      await reserveDailyUploadBytes(userId, buffer.byteLength);
      reservedBytes = buffer.byteLength;
      reservedUserId = userId;
    } catch (quotaErr) {
      if (quotaErr instanceof DailyUploadQuotaError) {
        throw quotaErr;
      }
      console.error("[drive/upload] 일일 업로드 한도 집계 실패 — 업로드는 계속합니다.", quotaErr);
    }

    const drive = getDriveV3();
    const created = await drive.files.create({
      requestBody: {
        name: displayName,
        parents: [folder.driveFileId],
      },
      media: {
        mimeType: mime,
        body: Readable.from(buffer),
      },
      fields:
        "id, name, mimeType, size, webViewLink, webContentLink, thumbnailLink, modifiedTime, parents",
      supportsAllDrives: true,
    });
    const tDriveDone = Date.now();

    const driveFileId = created.data.id;
    if (!driveFileId) {
      throw new Error("Drive 업로드 후 file id를 받지 못했습니다.");
    }

    reservedBytes = 0;
    reservedUserId = null;

    const dbFile = await prisma.driveFile.upsert({
      where: { driveFileId },
      create: {
        driveFileId,
        driveFolderId: folder.driveFileId,
        rootId: explorerRootId,
        name: created.data.name || displayName,
        mimeType: created.data.mimeType ?? mime,
        size: created.data.size != null ? BigInt(created.data.size) : BigInt(buffer.byteLength),
        webViewLink: created.data.webViewLink ?? null,
        webContentLink: created.data.webContentLink ?? null,
        thumbnailLink: created.data.thumbnailLink ?? null,
        isFolder: false,
        parentId: folder.id,
        source: "google_drive",
        createdBy: userId,
        driveModifiedAt: created.data.modifiedTime
          ? new Date(created.data.modifiedTime)
          : new Date(),
        lastSyncedAt: new Date(),
      },
      update: {
        driveFolderId: folder.driveFileId,
        rootId: explorerRootId,
        name: created.data.name || displayName,
        mimeType: created.data.mimeType ?? mime,
        size: created.data.size != null ? BigInt(created.data.size) : BigInt(buffer.byteLength),
        webViewLink: created.data.webViewLink ?? null,
        webContentLink: created.data.webContentLink ?? null,
        thumbnailLink: created.data.thumbnailLink ?? null,
        isFolder: false,
        parentId: folder.id,
        createdBy: userId,
        driveModifiedAt: created.data.modifiedTime
          ? new Date(created.data.modifiedTime)
          : new Date(),
        lastSyncedAt: new Date(),
      },
    });
    const tUpsertDone = Date.now();

    const timing = {
      receiveMs: tReceived - t0,
      driveMs: tDriveDone - tReceived,
      upsertMs: tUpsertDone - tDriveDone,
      totalMs: tUpsertDone - t0,
      bytes: buffer.byteLength,
    };
    console.log("[drive/upload] timing", timing);

    return NextResponse.json({
      ok: true,
      timing,
      file: {
        id: dbFile.id,
        driveFileId: dbFile.driveFileId,
        name: dbFile.name,
        mimeType: dbFile.mimeType,
        size: dbFile.size != null ? dbFile.size.toString() : null,
        isFolder: dbFile.isFolder,
        parentId: dbFile.parentId,
        webViewLink: dbFile.webViewLink,
        rootId: dbFile.rootId,
        createdBy: dbFile.createdBy,
        driveModifiedAt: dbFile.driveModifiedAt?.toISOString() ?? null,
      },
    });
  } catch (e) {
    if (reservedBytes > 0 && reservedUserId) {
      await releaseDailyUploadBytes(reservedUserId, reservedBytes);
    }
    if (e instanceof DailyUploadQuotaError) {
      return NextResponse.json({ error: e.message }, { status: 429 });
    }
    console.error("[drive/upload]", e);
    const msg = e instanceof Error ? e.message : "업로드에 실패했습니다.";
    return NextResponse.json(
      { error: msg.length < 400 ? msg : "업로드에 실패했습니다." },
      { status: 500 }
    );
  }
}
