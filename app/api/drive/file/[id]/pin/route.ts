import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { assertExplorerConfigured } from "@/lib/drive/explorer-folder-guard";
import {
  assertCanAccessDriveFileId,
  loadDriveAccessActor,
} from "@/lib/drive/folder-access";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/drive/file/[id]/pin
 * body: { pinned: boolean }
 * 개인 상단고정 토글 (접근 가능한 항목만)
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

    const body = (await req.json().catch(() => null)) as { pinned?: unknown } | null;
    if (typeof body?.pinned !== "boolean") {
      return NextResponse.json({ error: "pinned(boolean)가 필요합니다." }, { status: 400 });
    }
    const pinned = body.pinned;

    const row = await prisma.driveFile.findUnique({
      where: { id: fileId },
      select: { id: true, rootId: true, trashed: true, name: true },
    });
    if (!row || row.trashed) {
      return NextResponse.json({ error: "항목을 찾을 수 없습니다." }, { status: 404 });
    }
    if (row.rootId !== explorerRootId) {
      return NextResponse.json(
        { error: "탐색기 항목만 고정할 수 있습니다." },
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

    if (pinned) {
      await prisma.driveFilePin.upsert({
        where: {
          userId_driveFileId: {
            userId: session.user.id,
            driveFileId: row.id,
          },
        },
        create: {
          userId: session.user.id,
          driveFileId: row.id,
        },
        update: {},
      });
    } else {
      await prisma.driveFilePin.deleteMany({
        where: { userId: session.user.id, driveFileId: row.id },
      });
    }

    return NextResponse.json({ ok: true, id: row.id, pinned });
  } catch (e) {
    console.error("[drive/file pin]", e);
    return NextResponse.json({ error: "고정 처리에 실패했습니다." }, { status: 500 });
  }
}
