import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getServerWorkspaceScopeFromRequest } from "@/lib/workspace";
import { appendWorkLogOnceForTaskStatus, createActivityLog } from "@/lib/activity-log";
import { createNotificationWithOptions } from "@/lib/notifications";
import { z } from "zod";
import { format } from "date-fns";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
  assignedToId: z.string().optional(),
  parentId: z.string().optional(),
  categoryId: z.string().nullable().optional(),
  orderIndex: z.number().optional(),
});

export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scope = await getServerWorkspaceScopeFromRequest(req);
    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";

    const baseWhere =
      scope === "PERSONAL"
        ? { scope: "PERSONAL" as const, OR: [{ assignedToId: session.user.id }, { createdById: session.user.id }] }
        : { scope: "TEAM" as const, ...(isAdmin ? {} : { OR: [{ assignedToId: session.user.id }, { createdById: session.user.id }] }) };

    // 목록용: 본문(description) 제외 — BlockNote JSON이 크면 페이로드·파싱 비용이 큼. 상세는 /api/tasks/[id]
    const tasks = await prisma.task.findMany({
      where: baseWhere,
      select: {
        id: true,
        title: true,
        dueDate: true,
        isCompleted: true,
        status: true,
        priority: true,
        parentId: true,
        categoryId: true,
        orderIndex: true,
        isCollapsed: true,
        scope: true,
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
            position: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            position: true,
          },
        },
        _count: { select: { comments: true, attachments: true } },
      },
      orderBy: [{ parentId: "asc" }, { orderIndex: "asc" }, { isCompleted: "asc" }, { dueDate: "asc" }],
    });

    return NextResponse.json(tasks);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "업무 목록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const scope = await getServerWorkspaceScopeFromRequest(req);
    const task = await prisma.task.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        dueDate: new Date(parsed.data.dueDate),
        priority: parsed.data.priority ?? "MEDIUM",
        status: parsed.data.status ?? "TODO",
        assignedToId: parsed.data.assignedToId || session.user.id,
        createdById: session.user.id,
        parentId: parsed.data.parentId ?? null,
        categoryId: parsed.data.categoryId ?? null,
        orderIndex: parsed.data.orderIndex ?? 0,
        scope: scope === "PERSONAL" ? "PERSONAL" : "TEAM",
      },
      include: {
        assignedTo: { select: { name: true, position: true } },
        createdBy: { select: { name: true, position: true } },
      },
    });

    const dueDateStr = parsed.data.dueDate.slice(0, 10);
    const timestampForLog = dueDateStr ? new Date(dueDateStr + "T12:00:00") : undefined;
    await createActivityLog(session.user.id, "TASK_CREATED", task.title, undefined, timestampForLog ? { timestamp: timestampForLog } : undefined);

    // 최초 "준비(TODO)" 자동 기록: 생성 시 1회만 업무일지에 남김
    void appendWorkLogOnceForTaskStatus({
      userId: session.user.id,
      dateStr: format(new Date(), "yyyy-MM-dd"),
      taskId: task.id,
      taskTitle: task.title,
      status: (task.status as any) ?? "TODO",
    });

    if (task.assignedToId && task.assignedToId !== session.user.id) {
      await createNotificationWithOptions({
        userId: task.assignedToId,
        type: "ASSIGNED",
        message: `'${task.title}' 업무가 배정되었습니다.`,
        link: `/tasks/${task.id}`,
        actorId: session.user.id,
      });
    }

    return NextResponse.json(task);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "업무를 저장할 수 없습니다." },
      { status: 500 }
    );
  }
}
