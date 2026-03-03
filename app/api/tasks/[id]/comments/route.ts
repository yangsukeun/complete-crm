import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { createActivityLog } from "@/lib/activity-log";
import { createNotification } from "@/lib/notifications";
import { z } from "zod";

const postSchema = z.object({ body: z.string().min(1).max(2000) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: taskId } = await params;
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const allowed =
      (session.user.role === "EXECUTIVE" || session.user.role === "ADMIN") ||
      task.assignedToId === session.user.id ||
      task.createdById === session.user.id;
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "댓글 내용을 입력하세요." },
        { status: 400 }
      );
    }

    const comment = await prisma.taskComment.create({
      data: {
        taskId,
        userId: session.user.id,
        body: parsed.data.body.trim(),
      },
      include: { user: { select: { id: true, name: true, position: true } } },
    });
    await createActivityLog(session.user.id, "COMMENT_ADDED", task.title);

    const commentAuthorId = session.user.id;
    const toNotify = [task.assignedToId, task.createdById].filter(
      (id): id is string => !!id && id !== commentAuthorId
    );
    const uniqueIds = [...new Set(toNotify)];
    const commenterName = session.user.name ?? "누군가";
    for (const uid of uniqueIds) {
      await createNotification(
        uid,
        "COMMENT",
        `'${task.title}' 업무에 ${commenterName}님이 댓글을 달았습니다.`,
        `/tasks/${taskId}`
      );
    }

    return NextResponse.json(comment);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "댓글 등록에 실패했습니다." },
      { status: 500 }
    );
  }
}
