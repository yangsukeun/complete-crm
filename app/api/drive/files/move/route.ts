import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getDriveV3 } from "@/lib/google-drive-admin";
import { assertExplorerConfigured } from "@/lib/drive/explorer-folder-guard";
import {
  assertCanAccessDriveFileId,
  loadDriveAccessActor,
} from "@/lib/drive/folder-access";

export const runtime = "nodejs";
export const maxDuration = 120;

async function isDescendantOf(
  candidateId: string,
  ancestorId: string
): Promise<boolean> {
  let cur: string | null = candidateId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === ancestorId) return true;
    if (seen.has(cur)) break;
    seen.add(cur);
    const parentRow: { parentId: string | null } | null =
      await prisma.driveFile.findUnique({
        where: { id: cur },
        select: { parentId: true },
      });
    cur = parentRow?.parentId ?? null;
  }
  return false;
}

/**
 * POST /api/drive/files/move
 * body: { ids: string[], targetFolderId: string }  // target = DriveFile DB id (폴더)
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

    const body = (await req.json().catch(() => null)) as {
      ids?: unknown;
      targetFolderId?: unknown;
    } | null;

    const ids = Array.isArray(body?.ids)
      ? [...new Set(body!.ids.filter((x): x is string => typeof x === "string" && x.trim().length > 0))]
      : [];
    const targetFolderId =
      typeof body?.targetFolderId === "string" ? body.targetFolderId.trim() : "";

    if (ids.length === 0) {
      return NextResponse.json({ error: "이동할 항목을 선택하세요." }, { status: 400 });
    }
    if (ids.length > 50) {
      return NextResponse.json({ error: "한 번에 50개까지 이동할 수 있습니다." }, { status: 400 });
    }
    if (!targetFolderId) {
      return NextResponse.json({ error: "대상 폴더가 필요합니다." }, { status: 400 });
    }

    const target = await prisma.driveFile.findUnique({
      where: { id: targetFolderId },
      select: {
        id: true,
        name: true,
        driveFileId: true,
        rootId: true,
        isFolder: true,
        trashed: true,
      },
    });
    if (!target || !target.isFolder || target.trashed) {
      return NextResponse.json({ error: "대상 폴더를 찾을 수 없습니다." }, { status: 404 });
    }
    if (target.rootId !== explorerRootId || !target.driveFileId) {
      return NextResponse.json(
        { error: "탐색기 공유 드라이브 폴더로만 이동할 수 있습니다." },
        { status: 403 }
      );
    }

    const actor = await loadDriveAccessActor(session.user.id);
    if (!actor) {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 401 });
    }
    const targetAccess = await assertCanAccessDriveFileId(actor, target.id);
    if (!targetAccess.ok) {
      return NextResponse.json({ error: targetAccess.error }, { status: targetAccess.status });
    }

    const rows = await prisma.driveFile.findMany({
      where: { id: { in: ids }, trashed: false, rootId: explorerRootId },
      select: {
        id: true,
        name: true,
        driveFileId: true,
        parentId: true,
        isFolder: true,
        driveFolderId: true,
      },
    });
    if (rows.length !== ids.length) {
      return NextResponse.json(
        { error: "일부 항목을 찾을 수 없거나 휴지통에 있습니다." },
        { status: 404 }
      );
    }

    for (const row of rows) {
      if (row.id === target.id) {
        return NextResponse.json(
          { error: "폴더를 자기 자신으로 이동할 수 없습니다." },
          { status: 400 }
        );
      }
      if (row.isFolder && (await isDescendantOf(target.id, row.id))) {
        return NextResponse.json(
          { error: `「${row.name}」의 하위 폴더로는 이동할 수 없습니다.` },
          { status: 400 }
        );
      }
      if (row.parentId === target.id) {
        continue; // already there — skip later
      }
      const access = await assertCanAccessDriveFileId(actor, row.id);
      if (!access.ok) {
        return NextResponse.json(
          { error: `「${row.name}」: ${access.error}` },
          { status: access.status }
        );
      }
      if (!row.driveFileId) {
        return NextResponse.json(
          { error: `「${row.name}」은(는) Google Drive와 연결되어 있지 않습니다.` },
          { status: 400 }
        );
      }
    }

    const drive = getDriveV3();
    const moved: string[] = [];
    const skipped: string[] = [];
    const errors: { id: string; name: string; error: string }[] = [];

    for (const row of rows) {
      if (row.parentId === target.id) {
        skipped.push(row.id);
        continue;
      }
      try {
        const removeParents = row.driveFolderId || undefined;
        await drive.files.update({
          fileId: row.driveFileId!,
          addParents: target.driveFileId!,
          ...(removeParents ? { removeParents } : {}),
          supportsAllDrives: true,
          fields: "id,parents",
        });

        await prisma.driveFile.update({
          where: { id: row.id },
          data: {
            parentId: target.id,
            driveFolderId: target.driveFileId,
            updatedBy: session.user.id,
          },
        });

        await prisma.driveActivityLog.create({
          data: {
            driveFileId: row.id,
            action: "MOVE",
            actorId: session.user.id,
            detail: `「${row.name}」 → 「${target.name}」`,
          },
        });
        moved.push(row.id);
      } catch (e) {
        console.error("[drive/files/move]", row.id, e);
        errors.push({
          id: row.id,
          name: row.name,
          error: e instanceof Error ? e.message : "이동 실패",
        });
      }
    }

    return NextResponse.json({
      ok: errors.length === 0,
      moved,
      skipped,
      errors,
      targetFolderId: target.id,
    });
  } catch (e) {
    console.error("[drive/files/move]", e);
    return NextResponse.json({ error: "이동에 실패했습니다." }, { status: 500 });
  }
}
