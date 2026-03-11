import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getServerWorkspaceScopeFromRequest } from "@/lib/workspace";
import { createActivityLog } from "@/lib/activity-log";
import { createNotification } from "@/lib/notifications";
import { z } from "zod";

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

    const tasks = await prisma.task.findMany({
      where: baseWhere,
      include: {
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
            position: true,
            currentProject: { select: { name: true, brand: { select: { name: true } } } },
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            position: true,
            currentProject: { select: { name: true, brand: { select: { name: true } } } },
          },
        },
        attachments: true,
        comments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                position: true,
                currentProject: { select: { name: true, brand: { select: { name: true } } } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
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

    if (task.assignedToId && task.assignedToId !== session.user.id) {
      await createNotification(
        task.assignedToId,
        "ASSIGNED",
        `'${task.title}' 업무가 배정되었습니다.`,
        `/tasks/${task.id}`
      );
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
