import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getServerWorkspaceScopeFromRequest } from "@/lib/workspace";
import { createTaskWithNotifications } from "@/lib/tasks/create-task";
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

    const visibilityWhere =
      scope === "PERSONAL"
        ? { scope: "PERSONAL" as const, OR: [{ assignedToId: session.user.id }, { createdById: session.user.id }] }
        : { scope: "TEAM" as const, ...(isAdmin ? {} : { OR: [{ assignedToId: session.user.id }, { createdById: session.user.id }] }) };

    const baseWhere = { deletedAt: null, ...visibilityWhere };

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
        createdById: true,
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
    const task = await createTaskWithNotifications({
      createdById: session.user.id,
      scope,
      data: {
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        dueDate: parsed.data.dueDate,
        priority: parsed.data.priority ?? "MEDIUM",
        status: parsed.data.status ?? "TODO",
        assignedToId: parsed.data.assignedToId || session.user.id,
        parentId: parsed.data.parentId ?? null,
        categoryId: parsed.data.categoryId ?? null,
        orderIndex: parsed.data.orderIndex ?? 0,
      },
    });

    return NextResponse.json(task);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "업무를 저장할 수 없습니다." },
      { status: 500 }
    );
  }
}
