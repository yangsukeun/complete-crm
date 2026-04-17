import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { tryDeleteRemoteFileByUrl } from "@/lib/storage/delete-remote-upload";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: taskId, attachmentId } = await params;
    const att = await prisma.taskAttachment.findFirst({
      where: { id: attachmentId, taskId },
    });
    if (!att) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const task = await prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        assignedToId: true,
        createdById: true,
        assignees: { where: { userId: session.user.id }, select: { userId: true }, take: 1 },
      },
    });
    if (!task) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const allowed =
      session.user.role === "EXECUTIVE" ||
      session.user.role === "ADMIN" ||
      task.assignedToId === session.user.id ||
      task.assignees.length > 0;
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = att.url;
    try {
      await tryDeleteRemoteFileByUrl(url);
    } catch (e) {
      console.error("[tasks] attachment DELETE storage:", e);
    }
    await prisma.taskAttachment.delete({ where: { id: attachmentId } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE task attachment:", e);
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }
}
