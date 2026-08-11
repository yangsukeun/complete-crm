import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getDriveV3 } from "@/lib/google-drive-admin";
import { assertExplorerConfigured } from "@/lib/drive/explorer-folder-guard";
import {
  assertCanAccessDriveFileId,
  loadDriveAccessActor,
} from "@/lib/drive/folder-access";
import { canManageExplorerFolderTrash } from "@/lib/drive/folder-trash-policy";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 파일 삭제(기존): ADMIN/EXECUTIVE/TEAM_LEAD — 폴더 규칙과 분리 */
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

/** 폴더 포함 자손 id 수집 (본인 포함) */
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
 * DELETE /api/drive/file/[id]
 * - 파일: 기존 권한(TEAM_LEAD 포함) + Drive 휴지통 + DB row 삭제
 * - 폴더: ADMIN/EXECUTIVE 또는 생성자만 + Drive 휴지통 + DB soft-trash
 */
export async function DELETE(_req: Request, ctx: RouteCtx) {
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
      return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
    }

    if (row.trashed) {
      return NextResponse.json({ error: "이미 휴지통에 있습니다." }, { status: 400 });
    }

    if (row.rootId !== explorerRootId) {
      return NextResponse.json(
        { error: "탐색기 공유 드라이브 파일만 삭제할 수 있습니다." },
        { status: 403 }
      );
    }

    // —— 폴더 전용 권한 (TEAM_LEAD라도 생성자 아니면 403) ——
    if (row.isFolder) {
      if (
        !canManageExplorerFolderTrash({
          role: session.user.role,
          actorId: session.user.id,
          createdBy: row.createdBy,
        })
      ) {
        return NextResponse.json(
          { error: "폴더는 생성자 또는 대표/관리자만 삭제할 수 있습니다." },
          { status: 403 }
        );
      }
    } else {
      if (!canTrashExplorerFiles(session.user.role)) {
        return NextResponse.json(
          { error: "파일 삭제 권한이 없습니다. (ADMIN/EXECUTIVE/TEAM_LEAD)" },
          { status: 403 }
        );
      }
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

    if (row.isFolder) {
      const now = new Date();
      const ids = await collectDescendantIds(row.id);
      await prisma.driveFile.updateMany({
        where: { id: { in: ids } },
        data: {
          trashed: true,
          trashedAt: now,
          trashedBy: session.user.id,
        },
      });
      await prisma.driveActivityLog.create({
        data: {
          driveFileId: row.id,
          action: "DELETE",
          actorId: session.user.id,
          detail: `폴더 「${row.name}」 휴지통 이동 (${ids.length}건)`,
        },
      });
    } else {
      await deleteDriveFileTree(row.id);
    }

    console.log("[drive/file DELETE]", {
      actorId: session.user.id,
      role: session.user.role,
      driveFileIdPrefix: row.driveFileId.slice(0, 8) + "…",
      name: row.name,
      isFolder: row.isFolder,
      createdBy: row.createdBy,
      action: "trash",
      soft: row.isFolder,
    });

    return NextResponse.json({ ok: true, trashed: true, id: row.id, soft: row.isFolder });
  } catch (e) {
    console.error("[drive/file DELETE]", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg.length < 400 ? msg : "삭제 실패" }, { status: 500 });
  }
}
