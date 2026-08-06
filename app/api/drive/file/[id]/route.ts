import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getDriveV3 } from "@/lib/google-drive-admin";
import { assertExplorerConfigured } from "@/lib/drive/explorer-folder-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

function canTrashExplorerFiles(role: string | undefined): boolean {
  const r = String(role ?? "").toUpperCase();
  return r === "ADMIN" || r === "EXECUTIVE" || r === "TEAM_LEAD";
}

async function deleteDriveFileTree(id: string): Promise<void> {
  const children = await prisma.driveFile.findMany({
    where: { parentId: id },
    select: { id: true },
  });
  for (const child of children) {
    await deleteDriveFileTree(child.id);
  }
  await prisma.driveFile.delete({ where: { id } }).catch(() => {
    /* already gone */
  });
}

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * DELETE /api/drive/file/[id]
 * 탐색기 SHARED 파일만 휴지통 이동 + DriveFile 제거.
 * 첨부 자동저장(GOOGLE_DRIVE_FOLDER_ID / 다른 rootId)은 403.
 */
export async function DELETE(_req: Request, ctx: RouteCtx) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    if (!canTrashExplorerFiles(session.user.role)) {
      return NextResponse.json(
        { error: "파일 삭제 권한이 없습니다. (ADMIN/EXECUTIVE/TEAM_LEAD)" },
        { status: 403 }
      );
    }

    const configured = assertExplorerConfigured();
    if (!configured.ok) {
      return NextResponse.json({ error: configured.error }, { status: configured.status });
    }
    const { explorerRootId } = configured;

    const { id } = await ctx.params;
    const fileId = id?.trim();
    if (!fileId) {
      return NextResponse.json({ error: "파일 ID가 필요합니다." }, { status: 400 });
    }

    const row = await prisma.driveFile.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        name: true,
        driveFileId: true,
        rootId: true,
        isFolder: true,
        createdBy: true,
      },
    });

    if (!row) {
      return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
    }

    if (row.rootId !== explorerRootId) {
      return NextResponse.json(
        { error: "탐색기 공유 드라이브 파일만 삭제할 수 있습니다." },
        { status: 403 }
      );
    }

    if (!row.driveFileId) {
      return NextResponse.json(
        { error: "Google Drive 파일 ID가 없어 삭제할 수 없습니다." },
        { status: 400 }
      );
    }

    const drive = getDriveV3();
    await drive.files.update({
      fileId: row.driveFileId,
      requestBody: { trashed: true },
      supportsAllDrives: true,
    });

    await deleteDriveFileTree(row.id);

    console.log("[drive/file DELETE]", {
      actorId: session.user.id,
      role: session.user.role,
      driveFileIdPrefix: row.driveFileId.slice(0, 8) + "…",
      name: row.name,
      isFolder: row.isFolder,
      createdBy: row.createdBy,
      action: "trash",
    });

    return NextResponse.json({ ok: true, trashed: true, id: row.id });
  } catch (e) {
    console.error("[drive/file DELETE]", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg.length < 400 ? msg : "삭제 실패" }, { status: 500 });
  }
}
