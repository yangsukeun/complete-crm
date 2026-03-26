import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getServerWorkspaceScopeFromRequest } from "@/lib/workspace";
import { createTaskWithNotifications, jsonSerializeCreatedTask } from "@/lib/tasks/create-task";
import {
  serializeAssigneesFromRows,
  taskListAssigneesInclude,
  taskVisibilityMemberOr,
  type TaskAssigneeUser,
} from "@/lib/task-assignees";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
  assigneeIds: z.array(z.string()).optional(),
  assignedToId: z.string().optional(),
  parentId: z.string().optional(),
  categoryId: z.string().nullable().optional(),
  orderIndex: z.number().optional(),
});

const listSelect = {
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
      image: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      name: true,
      position: true,
    },
  },
  ...taskListAssigneesInclude,
} as const;

function mapListItem(task: Record<string, unknown>) {
  const assigneesRows = (task as { assignees?: { user: TaskAssigneeUser }[] }).assignees ?? [];
  const legacy = (task as { assignedTo?: TaskAssigneeUser | null }).assignedTo;
  const { assignees, assignedTo } = serializeAssigneesFromRows(assigneesRows, legacy);
  const { assignees: _a, ...rest } = task as { assignees?: unknown };
  return { ...rest, assignees, assignedTo };
}

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
        ? { scope: "PERSONAL" as const, OR: taskVisibilityMemberOr(session.user.id) }
        : { scope: "TEAM" as const, ...(isAdmin ? {} : { OR: taskVisibilityMemberOr(session.user.id) }) };

    const baseWhere = { deletedAt: null, ...visibilityWhere };

    const { searchParams } = new URL(req.url);
    const calendarDue = searchParams.get("calendarDue") === "1";
    const dueAfter = searchParams.get("dueAfter");
    const dueBefore = searchParams.get("dueBefore");

    if (calendarDue && dueAfter && dueBefore) {
      const scopeFilter = scope === "PERSONAL" ? { scope: "PERSONAL" as const } : { scope: "TEAM" as const };
      const where = {
        deletedAt: null,
        ...scopeFilter,
        dueDate: {
          gte: new Date(dueAfter),
          lte: new Date(dueBefore),
        },
        OR: [{ assignedToId: session.user.id }, { assignees: { some: { userId: session.user.id } } }],
      };
      const tasks = await prisma.task.findMany({
        where,
        select: {
          id: true,
          title: true,
          dueDate: true,
          isCompleted: true,
          status: true,
          assignedTo: {
            select: { id: true, name: true, email: true, position: true, image: true },
          },
          ...taskListAssigneesInclude,
        },
        orderBy: { dueDate: "asc" },
      });
      const body = tasks.map((t) => mapListItem(t as unknown as Record<string, unknown>));
      return NextResponse.json(body);
    }

    const all = searchParams.get("all") === "1";

    const orderBy = [{ parentId: "asc" as const }, { orderIndex: "asc" as const }, { isCompleted: "asc" as const }, { dueDate: "asc" as const }];

    if (all) {
      const tasks = await prisma.task.findMany({
        where: baseWhere,
        select: listSelect,
        orderBy,
      });
      return NextResponse.json(tasks.map((t) => mapListItem(t as unknown as Record<string, unknown>)));
    }

    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);

    const [total, tasks] = await Promise.all([
      prisma.task.count({ where: baseWhere }),
      prisma.task.findMany({
        where: baseWhere,
        select: listSelect,
        orderBy,
        skip: offset,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      items: tasks.map((t) => mapListItem(t as unknown as Record<string, unknown>)),
      total,
      hasMore: offset + tasks.length < total,
      offset,
      limit,
    });
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
        assigneeIds: parsed.data.assigneeIds,
        assignedToId: parsed.data.assignedToId,
        parentId: parsed.data.parentId ?? null,
        categoryId: parsed.data.categoryId ?? null,
        orderIndex: parsed.data.orderIndex ?? 0,
      },
    });

    return NextResponse.json(jsonSerializeCreatedTask(task));
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "업무를 저장할 수 없습니다." },
      { status: 500 }
    );
  }
}
