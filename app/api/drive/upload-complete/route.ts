import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getDriveV3 } from "@/lib/google-drive-admin";
import { verifyExplorerUploadSession } from "@/lib/drive/upload-session-token";

export const runtime = "nodejs";
export const maxDuration = 60;

async function registerDriveFileCache(opts: {
  driveFileId: string;
  userId: string;
  parentDbId: string;
  parentDriveId: string;
  rootId: string;
  fallbackName: string;
  fallbackMime: string;
  fallbackSize: number;
}) {
  const drive = getDriveV3();
  const meta = await drive.files.get({
    fileId: opts.driveFileId,
    fields:
      "id, name, mimeType, size, webViewLink, webContentLink, thumbnailLink, modifiedTime, parents",
    supportsAllDrives: true,
  });

  const name = meta.data.name || opts.fallbackName;
  const mime = meta.data.mimeType ?? opts.fallbackMime;
  const size =
    meta.data.size != null ? BigInt(meta.data.size) : BigInt(opts.fallbackSize);

  return prisma.driveFile.upsert({
    where: { driveFileId: opts.driveFileId },
    create: {
      driveFileId: opts.driveFileId,
      driveFolderId: opts.parentDriveId,
      rootId: opts.rootId,
      name,
      mimeType: mime,
      size,
      webViewLink: meta.data.webViewLink ?? null,
      webContentLink: meta.data.webContentLink ?? null,
      thumbnailLink: meta.data.thumbnailLink ?? null,
      isFolder: false,
      parentId: opts.parentDbId,
      source: "google_drive",
      createdBy: opts.userId,
      driveModifiedAt: meta.data.modifiedTime
        ? new Date(meta.data.modifiedTime)
        : new Date(),
      lastSyncedAt: new Date(),
    },
    update: {
      driveFolderId: opts.parentDriveId,
      rootId: opts.rootId,
      name,
      mimeType: mime,
      size,
      webViewLink: meta.data.webViewLink ?? null,
      webContentLink: meta.data.webContentLink ?? null,
      thumbnailLink: meta.data.thumbnailLink ?? null,
      isFolder: false,
      parentId: opts.parentDbId,
      createdBy: opts.userId,
      driveModifiedAt: meta.data.modifiedTime
        ? new Date(meta.data.modifiedTime)
        : new Date(),
      lastSyncedAt: new Date(),
    },
  });
}

/**
 * POST /api/drive/upload-complete
 * body: { fileId, sessionToken? }
 * Google에 이미 올라간 파일을 DriveFile 캐시에 등록. 실패 시 재시도 가능.
 */
export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const userId = session.user.id;

    const body = (await req.json().catch(() => null)) as {
      fileId?: unknown;
      sessionToken?: unknown;
    } | null;

    const fileId = typeof body?.fileId === "string" ? body.fileId.trim() : "";
    const sessionToken =
      typeof body?.sessionToken === "string" ? body.sessionToken.trim() : "";

    if (!fileId) {
      return NextResponse.json({ error: "fileId가 필요합니다." }, { status: 400 });
    }

    let parentDbId: string | null = null;
    let parentDriveId: string | null = null;
    let rootId: string | null = null;
    let fallbackName = "file";
    let fallbackMime = "application/octet-stream";
    let fallbackSize = 0;

    if (sessionToken) {
      const verified = verifyExplorerUploadSession(sessionToken);
      if (!verified.ok) {
        return NextResponse.json({ error: verified.error }, { status: 403 });
      }
      if (verified.payload.uid !== userId) {
        return NextResponse.json({ error: "세션 소유자가 아닙니다." }, { status: 403 });
      }
      parentDbId = verified.payload.parentDbId;
      parentDriveId = verified.payload.parentDriveId;
      rootId = verified.payload.rootId;
      fallbackName = verified.payload.name;
      fallbackMime = verified.payload.mime;
      fallbackSize = verified.payload.size;
    } else {
      // 토큰 없이 fileId만 온 경우: 기존 Drive 메타 + 요청자 접근 폴더로 추정 불가 → 거부
      return NextResponse.json(
        { error: "sessionToken이 필요합니다. (캐시 등록 재시도 시에도 세션 토큰을 포함하세요)" },
        { status: 400 }
      );
    }

    const maxAttempts = 3;
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const dbFile = await registerDriveFileCache({
          driveFileId: fileId,
          userId,
          parentDbId: parentDbId!,
          parentDriveId: parentDriveId!,
          rootId: rootId!,
          fallbackName,
          fallbackMime,
          fallbackSize,
        });

        return NextResponse.json({
          ok: true,
          attempt,
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
        lastErr = e;
        console.error(`[upload-complete] attempt ${attempt}/${maxAttempts}`, e);
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
        }
      }
    }

    const msg = lastErr instanceof Error ? lastErr.message : "캐시 등록 실패";
    return NextResponse.json(
      {
        error:
          "Google에는 업로드됐지만 CRM 목록 등록에 실패했습니다. 잠시 후 다시 시도하거나 새로고침하세요.",
        detail: msg.length < 200 ? msg : undefined,
        fileId,
        retryable: true,
      },
      { status: 502 }
    );
  } catch (e) {
    console.error("[upload-complete]", e);
    return NextResponse.json({ error: "업로드 완료 처리에 실패했습니다." }, { status: 500 });
  }
}
