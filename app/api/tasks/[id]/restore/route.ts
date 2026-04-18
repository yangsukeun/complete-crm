import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getServerWorkspaceScopeFromRequest } from "@/lib/workspace";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const scope = await getServerWorkspaceScopeFromRequest(req);

    const row = await prisma.task.findFirst({
      where: { id },
      select: {
        deletedAt: true,
        deletedById: true,
        scope: true,
        createdById: true,
        assignedToId: true,
        assignees: { select: { userId: true } },
      },
    });
    if (!row || !row.deletedAt) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if ((row.scope ?? "TEAM") !== scope) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    const isCreator = row.createdById === session.user.id;
    if (!isAdmin && !isCreator) {
      return NextResponse.json({ error: "복구 권한이 없습니다." }, { status: 403 });
    }

    const oldDel = row.deletedAt.toISOString();
    await prisma.task.update({
      where: { id },
      data: { deletedAt: null, deletedById: null, updatedAt: new Date() },
    });

    await logAudit({
      taskId: id,
      actorId: session.user.id,
      field: "deletedAt",
      oldValue: oldDel,
      newValue: null,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[tasks/restore]", e);
    return NextResponse.json({ error: "복구에 실패했습니다." }, { status: 500 });
  }
}
