import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getServerWorkspaceScopeFromRequest } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: taskId } = await params;
    const scope = await getServerWorkspaceScopeFromRequest(req);

    const task = await prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        scope: true,
        assignedToId: true,
        createdById: true,
        assignees: { select: { userId: true } },
      },
    });
    if (!task) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if ((task.scope ?? "TEAM") !== scope) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    const isAssignee =
      task.assignedToId === session.user.id || task.assignees.some((a) => a.userId === session.user.id);
    if (!isAdmin && !isAssignee) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rows = await prisma.taskAuditLog.findMany({
      where: { taskId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        actor: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        field: r.field,
        oldValue: r.oldValue,
        newValue: r.newValue,
        createdAt: r.createdAt.toISOString(),
        actor: r.actor ? { id: r.actor.id, name: r.actor.name } : { id: r.actorId, name: null as string | null },
      }))
    );
  } catch (e) {
    console.error("[tasks/audit GET]", e);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}
