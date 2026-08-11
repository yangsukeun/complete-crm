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

const CREATE_TYPES = {
  document: {
    mimeType: "application/vnd.google-apps.document",
    defaultName: "제목 없는 문서",
  },
  spreadsheet: {
    mimeType: "application/vnd.google-apps.spreadsheet",
    defaultName: "제목 없는 스프레드시트",
  },
  presentation: {
    mimeType: "application/vnd.google-apps.presentation",
    defaultName: "제목 없는 프레젠테이션",
  },
} as const;

type CreateFileType = keyof typeof CREATE_TYPES;

/**
 * POST /api/drive/create-file
 * Google Docs/Sheets/Slides 빈 파일 생성.
 * body: { type, folderId, name? } — folderId = Google Drive 폴더 ID
 */
export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const userId = session.user.id;

    const body = (await req.json().catch(() => null)) as {
      type?: unknown;
      folderId?: unknown;
      name?: unknown;
    } | null;

    const typeRaw = typeof body?.type === "string" ? body.type.trim() : "";
    if (!(typeRaw in CREATE_TYPES)) {
      return NextResponse.json(
        { error: "type은 document | spreadsheet | presentation 중 하나여야 합니다." },
        { status: 400 }
      );
    }
    const type = typeRaw as CreateFileType;
    const meta = CREATE_TYPES[type];

    const folderId = typeof body?.folderId === "string" ? body.folderId.trim() : "";
    if (!folderId) {
      return NextResponse.json({ error: "대상 폴더(folderId)가 필요합니다." }, { status: 400 });
    }

    const nameRaw = typeof body?.name === "string" ? body.name.trim() : "";
    const name = nameRaw || meta.defaultName;
    if (name.length > 200) {
      return NextResponse.json({ error: "파일 이름이 너무 깁니다." }, { status: 400 });
    }

    const resolved = await resolveExplorerUploadFolder(folderId);
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

    const drive = getDriveV3();
    const created = await drive.files.create({
      requestBody: {
        name,
        mimeType: meta.mimeType,
        parents: [folder.driveFileId],
      },
      fields: "id, name, mimeType, webViewLink, modifiedTime, parents",
      supportsAllDrives: true,
    });

    const driveFileId = created.data.id;
    if (!driveFileId) {
      throw new Error("Drive 파일 생성 후 file id를 받지 못했습니다.");
    }

    const dbFile = await prisma.driveFile.upsert({
      where: { driveFileId },
      create: {
        driveFileId,
        driveFolderId: folder.driveFileId,
        rootId: explorerRootId,
        name: created.data.name || name,
        mimeType: created.data.mimeType ?? meta.mimeType,
        size: null,
        webViewLink: created.data.webViewLink ?? null,
        webContentLink: null,
        thumbnailLink: null,
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
        name: created.data.name || name,
        mimeType: created.data.mimeType ?? meta.mimeType,
        isFolder: false,
        parentId: folder.id,
        createdBy: userId,
        webViewLink: created.data.webViewLink ?? null,
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
        isFolder: false,
        parentId: dbFile.parentId,
        webViewLink: dbFile.webViewLink,
        rootId: dbFile.rootId,
        createdBy: dbFile.createdBy,
        driveModifiedAt: dbFile.driveModifiedAt?.toISOString() ?? null,
        folderName: folder.name,
        folderDriveId: folder.driveFileId,
        folderDbId: folder.id,
      },
    });
  } catch (e) {
    console.error("[drive/create-file]", e);
    const msg = e instanceof Error ? e.message : "파일 생성에 실패했습니다.";
    return NextResponse.json(
      { error: msg.length < 400 ? msg : "파일 생성에 실패했습니다." },
      { status: 500 }
    );
  }
}
