import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getServerWorkspaceScopeFromRequest } from "@/lib/workspace";

export const runtime = "nodejs";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: taskId, commentId } = await params;
    const scope = await getServerWorkspaceScopeFromRequest(req);

    const comment = await prisma.taskComment.findFirst({
      where: { id: commentId, taskId, deletedAt: null },
      select: { id: true, userId: true },
    });
    if (!comment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const task = await prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        scope: true,
        assignedToId: true,
        createdById: true,
        assignees: { select: { userId: true } },
      },
    });
    if (!task || (task.scope ?? "TEAM") !== scope) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    const isAssignee =
      task.assignedToId === session.user.id || task.assignees.some((a) => a.userId === session.user.id);
    const isAuthor = comment.userId === session.user.id;
    if (!isAdmin && !isAssignee && !isAuthor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.taskComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[comments DELETE]", e);
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }
}
