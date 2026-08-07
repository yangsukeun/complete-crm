import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getDriveV3 } from "@/lib/google-drive-admin";
import { resolveExplorerUploadFolder } from "@/lib/drive/explorer-folder-guard";
import {
  assertCanAccessDriveFileId,
  loadDriveAccessActor,
} from "@/lib/drive/folder-access";

export const runtime = "nodejs";

const FOLDER_MIME = "application/vnd.google-apps.folder";

/**
 * POST /api/drive/folder
 * 탐색기 SHARED 드라이브(EXPLORER) 하위에 폴더 생성.
 * body: { name, parentFolderId } — parentFolderId = Google Drive 폴더 ID
 */
export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const userId = session.user.id;

    const body = (await req.json().catch(() => null)) as {
      name?: unknown;
      parentFolderId?: unknown;
    } | null;

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const parentFolderId =
      typeof body?.parentFolderId === "string" ? body.parentFolderId.trim() : "";

    if (!name) {
      return NextResponse.json({ error: "폴더 이름을 입력하세요." }, { status: 400 });
    }
    if (name.length > 200) {
      return NextResponse.json({ error: "폴더 이름이 너무 깁니다." }, { status: 400 });
    }
    if (!parentFolderId) {
      return NextResponse.json(
        { error: "대상 폴더(parentFolderId)가 필요합니다." },
        { status: 400 }
      );
    }

    const resolved = await resolveExplorerUploadFolder(parentFolderId);
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

    const duplicate = await prisma.driveFile.findFirst({
      where: {
        parentId: folder.id,
        isFolder: true,
        rootId: explorerRootId,
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "같은 이름의 폴더가 이미 있습니다." },
        { status: 409 }
      );
    }

    const drive = getDriveV3();
    const created = await drive.files.create({
      requestBody: {
        name,
        mimeType: FOLDER_MIME,
        parents: [folder.driveFileId],
      },
      fields: "id, name, mimeType, webViewLink, modifiedTime, parents",
      supportsAllDrives: true,
    });

    const driveFileId = created.data.id;
    if (!driveFileId) {
      throw new Error("Drive 폴더 생성 후 file id를 받지 못했습니다.");
    }

    const dbFile = await prisma.driveFile.upsert({
      where: { driveFileId },
      create: {
        driveFileId,
        driveFolderId: folder.driveFileId,
        rootId: explorerRootId,
        name: created.data.name || name,
        mimeType: created.data.mimeType ?? FOLDER_MIME,
        size: null,
        webViewLink: created.data.webViewLink ?? null,
        webContentLink: null,
        thumbnailLink: null,
        isFolder: true,
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
        name: created.data.name || name,
        mimeType: created.data.mimeType ?? FOLDER_MIME,
        isFolder: true,
        parentId: folder.id,
        createdBy: userId,
        driveModifiedAt: created.data.modifiedTime
          ? new Date(created.data.modifiedTime)
          : new Date(),
        lastSyncedAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      file: {
        id: dbFile.id,
        driveFileId: dbFile.driveFileId,
        name: dbFile.name,
        mimeType: dbFile.mimeType,
        size: null,
        isFolder: true,
        parentId: dbFile.parentId,
        webViewLink: dbFile.webViewLink,
        rootId: dbFile.rootId,
        createdBy: dbFile.createdBy,
        driveModifiedAt: dbFile.driveModifiedAt?.toISOString() ?? null,
        _count: { children: 0 },
      },
    });
  } catch (e) {
    console.error("[drive/folder]", e);
    const msg = e instanceof Error ? e.message : "폴더 생성에 실패했습니다.";
    return NextResponse.json(
      { error: msg.length < 400 ? msg : "폴더 생성에 실패했습니다." },
      { status: 500 }
    );
  }
}
