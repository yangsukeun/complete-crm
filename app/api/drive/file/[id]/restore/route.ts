import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getDriveV3 } from "@/lib/google-drive-admin";
import { assertExplorerConfigured } from "@/lib/drive/explorer-folder-guard";
import {
  assertCanAccessDriveFileId,
  loadDriveAccessActor,
} from "@/lib/drive/folder-access";
import {
  canManageExplorerFolderTrash,
  isDriveAdminRole,
} from "@/lib/drive/folder-trash-policy";

export const runtime = "nodejs";
export const maxDuration = 60;

async function collectDescendantIds(rootId: string): Promise<string[]> {
  const ids: string[] = [rootId];
  const queue = [rootId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const children = await prisma.driveFile.findMany({
      where: { parentId },
      select: { id: true },
    });
    for (const c of children) {
      ids.push(c.id);
      queue.push(c.id);
    }
  }
  return ids;
}

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * POST /api/drive/file/[id]/restore
 * 폴더(및 soft-trash된 항목) 복원. 권한 = 폴더 삭제와 동일.
 */
export async function POST(_req: Request, ctx: RouteCtx) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
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
        trashed: true,
      },
    });

    if (!row) {
      return NextResponse.json({ error: "항목을 찾을 수 없습니다." }, { status: 404 });
    }
    if (!row.trashed) {
      return NextResponse.json({ error: "휴지통에 있는 항목만 복원할 수 있습니다." }, { status: 400 });
    }
    if (row.rootId !== explorerRootId) {
      return NextResponse.json(
        { error: "탐색기 공유 드라이브 항목만 복원할 수 있습니다." },
        { status: 403 }
      );
    }

    // 폴더: 생성자 또는 관리자. 파일: 관리자(휴지통 UI) 또는 생성자.
    const canRestore = row.isFolder
      ? canManageExplorerFolderTrash({
          role: session.user.role,
          actorId: session.user.id,
          createdBy: row.createdBy,
        })
      : isDriveAdminRole(session.user.role) ||
        (Boolean(row.createdBy) && row.createdBy === session.user.id);

    if (!canRestore) {
      return NextResponse.json(
        { error: "복원 권한이 없습니다. (생성자 또는 대표/관리자)" },
        { status: 403 }
      );
    }

    const actor = await loadDriveAccessActor(session.user.id);
    if (!actor) {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 401 });
    }
    const access = await assertCanAccessDriveFileId(actor, row.id);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    if (!row.driveFileId) {
      return NextResponse.json(
        { error: "Google Drive 파일 ID가 없어 복원할 수 없습니다." },
        { status: 400 }
      );
    }

    const drive = getDriveV3();
    await drive.files.update({
      fileId: row.driveFileId,
      requestBody: { trashed: false },
      supportsAllDrives: true,
    });

    const ids = row.isFolder ? await collectDescendantIds(row.id) : [row.id];
    await prisma.driveFile.updateMany({
      where: { id: { in: ids } },
      data: {
        trashed: false,
        trashedAt: null,
        trashedBy: null,
      },
    });

    await prisma.driveActivityLog.create({
      data: {
        driveFileId: row.id,
        action: "RESTORE",
        actorId: session.user.id,
        detail: `「${row.name}」 복원 (${ids.length}건)`,
      },
    });

    return NextResponse.json({ ok: true, restored: true, id: row.id });
  } catch (e) {
    console.error("[drive/file restore]", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg.length < 400 ? msg : "복원 실패" }, { status: 500 });
  }
}
