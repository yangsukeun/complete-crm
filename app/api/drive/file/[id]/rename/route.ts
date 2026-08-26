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
  canRenameExplorerItem,
  sanitizeExplorerRenameName,
} from "@/lib/drive/folder-trash-policy";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/drive/file/[id]/rename
 * body: { name }
 * Google Drive files.update → DB 캐시 동기화. Drive 실패 시 캐시 미변경.
 */
export async function PATCH(req: Request, ctx: RouteCtx) {
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

    const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
    const sanitized = sanitizeExplorerRenameName(body?.name);
    if (!sanitized.ok) {
      return NextResponse.json({ error: sanitized.error }, { status: 400 });
    }
    const newName = sanitized.name;

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
    if (row.trashed) {
      return NextResponse.json(
        { error: "휴지통 항목은 이름을 바꿀 수 없습니다." },
        { status: 400 }
      );
    }
    if (row.rootId !== explorerRootId) {
      return NextResponse.json(
        { error: "탐색기 공유 드라이브 항목만 이름을 바꿀 수 있습니다." },
        { status: 403 }
      );
    }

    if (
      !canRenameExplorerItem({
        role: session.user.role,
        actorId: session.user.id,
        createdBy: row.createdBy,
        isFolder: row.isFolder,
      })
    ) {
      return NextResponse.json(
        { error: "이름 변경 권한이 없습니다." },
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
        { error: "Google Drive 파일 ID가 없어 이름을 바꿀 수 없습니다." },
        { status: 400 }
      );
    }

    if (row.name === newName) {
      return NextResponse.json({
        ok: true,
        unchanged: true,
        file: { id: row.id, name: row.name, isFolder: row.isFolder },
      });
    }

    const previousName = row.name;
    const drive = getDriveV3();
    try {
      await drive.files.update({
        fileId: row.driveFileId,
        requestBody: { name: newName },
        supportsAllDrives: true,
        fields: "id,name",
      });
    } catch (e) {
      console.error("[drive/file rename] google update failed", e);
      return NextResponse.json(
        { error: "Google Drive 이름 변경에 실패했습니다. 목록은 변경되지 않았습니다." },
        { status: 502 }
      );
    }

    const updated = await prisma.driveFile.update({
      where: { id: row.id },
      data: {
        name: newName,
        updatedBy: session.user.id,
      },
      select: {
        id: true,
        name: true,
        isFolder: true,
        driveFileId: true,
        updatedBy: true,
      },
    });

    await prisma.driveActivityLog.create({
      data: {
        driveFileId: row.id,
        action: "RENAME",
        actorId: session.user.id,
        detail: `「${previousName}」 → 「${newName}」`,
      },
    });

    console.log("[drive/file rename]", {
      actorId: session.user.id,
      id: row.id,
      previousName,
      newName,
      isFolder: row.isFolder,
    });

    return NextResponse.json({
      ok: true,
      file: updated,
      previousName,
    });
  } catch (e) {
    console.error("[drive/file rename]", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg.length < 400 ? msg : "이름 변경 실패" },
      { status: 500 }
    );
  }
}
