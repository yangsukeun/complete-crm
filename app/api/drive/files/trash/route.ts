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
  canTrashExplorerFile,
} from "@/lib/drive/folder-trash-policy";

export const runtime = "nodejs";
export const maxDuration = 120;

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

/**
 * POST /api/drive/files/trash
 * body: { ids: string[] }
 * 일괄 휴지통 이동 (항목별 삭제 권한 적용)
 */
export async function POST(req: Request) {
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

    const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
    const ids = Array.isArray(body?.ids)
      ? [...new Set(body!.ids.filter((x): x is string => typeof x === "string" && x.trim().length > 0))]
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "삭제할 항목을 선택하세요." }, { status: 400 });
    }
    if (ids.length > 50) {
      return NextResponse.json({ error: "한 번에 50개까지 삭제할 수 있습니다." }, { status: 400 });
    }

    const actor = await loadDriveAccessActor(session.user.id);
    if (!actor) {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 401 });
    }

    const rows = await prisma.driveFile.findMany({
      where: { id: { in: ids }, trashed: false, rootId: explorerRootId },
      select: {
        id: true,
        name: true,
        driveFileId: true,
        isFolder: true,
        createdBy: true,
      },
    });

    const drive = getDriveV3();
    const trashed: string[] = [];
    const errors: { id: string; name: string; error: string }[] = [];

    // 폴더를 먼저 처리하면 하위가 포함될 수 있으므로, 선택분 중 상위만 남기기
    const idSet = new Set(rows.map((r) => r.id));
    const parents = await prisma.driveFile.findMany({
      where: { id: { in: [...idSet] } },
      select: { id: true, parentId: true },
    });
    const parentMap = new Map(parents.map((p) => [p.id, p.parentId]));
    const isNestedInSelection = (id: string): boolean => {
      let cur = parentMap.get(id) ?? null;
      while (cur) {
        if (idSet.has(cur)) return true;
        cur = parentMap.get(cur) ?? null;
      }
      return false;
    };
    const roots = rows.filter((r) => !isNestedInSelection(r.id));

    for (const row of roots) {
      try {
        if (row.isFolder) {
          if (
            !canManageExplorerFolderTrash({
              role: session.user.role,
              actorId: session.user.id,
              createdBy: row.createdBy,
            })
          ) {
            errors.push({
              id: row.id,
              name: row.name,
              error: "폴더는 생성자 또는 대표/관리자만 삭제할 수 있습니다.",
            });
            continue;
          }
        } else if (
          !canTrashExplorerFile({
            role: session.user.role,
            actorId: session.user.id,
            createdBy: row.createdBy,
          })
        ) {
          errors.push({
            id: row.id,
            name: row.name,
            error: "파일 삭제 권한이 없습니다.",
          });
          continue;
        }

        const access = await assertCanAccessDriveFileId(actor, row.id);
        if (!access.ok) {
          errors.push({ id: row.id, name: row.name, error: access.error });
          continue;
        }
        if (!row.driveFileId) {
          errors.push({
            id: row.id,
            name: row.name,
            error: "Google Drive 파일 ID가 없습니다.",
          });
          continue;
        }

        await drive.files.update({
          fileId: row.driveFileId,
          requestBody: { trashed: true },
          supportsAllDrives: true,
        });

        const now = new Date();
        const descendantIds = row.isFolder
          ? await collectDescendantIds(row.id)
          : [row.id];
        await prisma.driveFile.updateMany({
          where: { id: { in: descendantIds } },
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
            detail: row.isFolder
              ? `폴더 「${row.name}」 휴지통 이동 (${descendantIds.length}건)`
              : `파일 「${row.name}」 휴지통 이동`,
          },
        });
        trashed.push(...descendantIds);
      } catch (e) {
        console.error("[drive/files/trash]", row.id, e);
        errors.push({
          id: row.id,
          name: row.name,
          error: e instanceof Error ? e.message : "삭제 실패",
        });
      }
    }

    return NextResponse.json({
      ok: errors.length === 0,
      trashed: [...new Set(trashed)],
      errors,
    });
  } catch (e) {
    console.error("[drive/files/trash]", e);
    return NextResponse.json({ error: "일괄 삭제에 실패했습니다." }, { status: 500 });
  }
}
