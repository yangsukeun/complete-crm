import { NextResponse, after } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getServerWorkspaceScopeFromRequest } from "@/lib/workspace";
import { createActivityLog } from "@/lib/activity-log";
import { createNotificationWithOptions } from "@/lib/notifications";
import { z } from "zod";

const postSchema = z.object({ body: z.string().min(1).max(2000) });

// [PERF-auto] 프로젝트 상세: 본문 JSON과 병렬로 댓글만 가볍게 분리 로드
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: taskId } = await params;
    const scope = await getServerWorkspaceScopeFromRequest(req);
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        deletedAt: true,
        scope: true,
        assignedToId: true,
        createdById: true,
        assignees: { select: { user: { select: { id: true } } } },
      },
    });
    if (!task || task.deletedAt) {
      return NextResponse.json(
        { error: "not_found", message: "존재하지 않거나 삭제된 프로젝트입니다." },
        { status: 404 }
      );
    }
    const taskScope = task.scope ?? "TEAM";
    if (taskScope !== scope) {
      return NextResponse.json(
        {
          error: "workspace_mismatch",
          message:
            taskScope === "TEAM"
              ? "이 프로젝트는 팀(회사) 업무입니다. 회사(팀) 모드로 전환한 뒤 다시 시도해 주세요."
              : "이 프로젝트는 개인 업무입니다. 개인 모드로 전환한 뒤 다시 시도해 주세요.",
          taskScope,
          requestScope: scope,
        },
        { status: 403 }
      );
    }
    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    const isAssignee =
      task.assignedToId === session.user.id ||
      task.assignees.some((a) => a.user.id === session.user.id);
    if (!isAdmin && !isAssignee) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rows = await prisma.taskComment.findMany({
      where: { taskId },
      include: {
        user: { select: { id: true, name: true, position: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(
      rows.map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt.toISOString(),
        user: c.user ?? { id: "", name: null as string | null, position: null as string | null },
      }))
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "댓글을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

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
    const task = await prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        title: true,
        assignedToId: true,
        createdById: true,
        assignees: { select: { userId: true } },
      },
    });
    if (!task) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const allowed =
      (session.user.role === "EXECUTIVE" || session.user.role === "ADMIN") ||
      task.assignedToId === session.user.id ||
      task.assignees.some((a) => a.userId === session.user.id);
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

    const commentAuthorId = session.user.id;
    const assigneeNotifyIds = [
      ...(task.assignedToId ? [task.assignedToId] : []),
      ...task.assignees.map((a) => a.userId),
    ];
    const toNotify = [...new Set(assigneeNotifyIds), task.createdById].filter(
      (id): id is string => !!id && id !== commentAuthorId
    );
    const uniqueIds = [...new Set(toNotify)];
    const commenterName = session.user.name ?? "누군가";
    const taskTitle = task.title;
    const actorId = session.user.id;

    after(async () => {
      try {
        await createActivityLog(commentAuthorId, "COMMENT_ADDED", taskTitle);
        await Promise.all(
          uniqueIds.map((uid) =>
            createNotificationWithOptions({
              userId: uid,
              type: "COMMENT",
              message: `'${taskTitle}' 프로젝트에 ${commenterName}님이 댓글을 달았습니다.`,
              link: `/tasks/${taskId}`,
              actorId,
            })
          )
        );
      } catch (err) {
        console.error("[comments POST] after():", err);
      }
    });

    const payload = {
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      user:
        comment.user ??
        ({
          id: "",
          name: null as string | null,
          position: null as string | null,
        } as const),
    };
    return NextResponse.json(payload);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "댓글 등록에 실패했습니다." },
      { status: 500 }
    );
  }
}
