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
import { endOfDay, endOfWeek, parse, startOfDay, startOfWeek } from "date-fns";

/** null·비배열·숫자 id 등 클라이언트/직렬화 불일치 시 400 방지 */
const assigneeIdsInCreate = z.preprocess((val: unknown) => {
  if (val == null) return undefined;
  if (!Array.isArray(val)) return undefined;
  return val
    .map((x) => (x == null ? "" : String(x)))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}, z.array(z.string()).optional());

/** parentId / projectId / categoryId / assignedToId: null, 숫자, 빈 문자열 정규화 */
const optionalIdish = z.preprocess((v: unknown) => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return String(v);
}, z.string().nullable().optional());

const createSchema = z.object({
  title: z.string().trim().min(1),
  description: z.union([z.string(), z.null()]).optional(),
  dueDate: z.string().min(1),
  priority: z
    .enum(["HIGH", "MEDIUM", "LOW"])
    .optional()
    .nullable()
    .transform((v) => v ?? undefined),
  status: z
    .enum(["TODO", "IN_PROGRESS", "DONE"])
    .optional()
    .nullable()
    .transform((v) => v ?? undefined),
  assigneeIds: assigneeIdsInCreate,
  assignedToId: optionalIdish,
  parentId: optionalIdish,
  categoryId: optionalIdish,
  orderIndex: z.preprocess((v: unknown) => {
    if (v === undefined || v === null) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  }, z.number().optional()),
  projectId: optionalIdish,
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
  projectId: true,
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

    const { searchParams } = new URL(req.url);

    /** 네비 Projects 배지: 업무(Task) 배정 알림만 (/tasks/ 링크), 일정 초대(/schedule) 제외 */
    if (searchParams.get("assignedToMe") === "1" && searchParams.get("isNew") === "1") {
      const count = await prisma.notification.count({
        where: {
          userId: session.user.id,
          isRead: false,
          type: "ASSIGNED",
          link: { startsWith: "/tasks/" },
        },
      });
      return NextResponse.json(
        { count },
        {
          headers: {
            "Cache-Control": "private, max-age=15, stale-while-revalidate=60",
          },
        }
      );
    }

    // [PERF-auto] CRM 프로젝트 단위 목록: 전체 all=1 대신 projectId+limit로 한정 가능
    const projectIdParam = searchParams.get("projectId");
    const projectId =
      projectIdParam && projectIdParam.trim().length > 0 ? projectIdParam.trim() : null;

    const baseWhere = {
      deletedAt: null,
      ...visibilityWhere,
      ...(projectId ? { projectId } : {}),
    };

    const calendarDue = searchParams.get("calendarDue") === "1";
    const dueAfter = searchParams.get("dueAfter");
    const dueBefore = searchParams.get("dueBefore");
    const monthKey = searchParams.get("monthKey");
    const weekKey = searchParams.get("weekKey");

    let calStart: Date | null = null;
    let calEnd: Date | null = null;
    if (calendarDue) {
      if (monthKey && /^\d{4}-\d{2}$/.test(monthKey)) {
        const [y, mo] = monthKey.split("-").map((x) => parseInt(x, 10));
        calStart = new Date(y, mo - 1, 1, 0, 0, 0, 0);
        calEnd = new Date(y, mo, 0, 23, 59, 59, 999);
      } else if (weekKey && /^\d{4}-\d{2}-\d{2}$/.test(weekKey)) {
        const anchor = new Date(`${weekKey}T12:00:00`);
        calStart = startOfWeek(anchor, { weekStartsOn: 1 });
        calEnd = endOfWeek(anchor, { weekStartsOn: 1 });
      } else if (dueAfter && dueBefore) {
        calStart = new Date(dueAfter);
        calEnd = new Date(dueBefore);
      }
    }

    if (
      calendarDue &&
      calStart &&
      calEnd &&
      !Number.isNaN(calStart.getTime()) &&
      !Number.isNaN(calEnd.getTime())
    ) {
      // [PERF-2차] 캘린더 마감 레이어: 최소 컬럼만 조회
      const scopeFilter = scope === "PERSONAL" ? { scope: "PERSONAL" as const } : { scope: "TEAM" as const };
      const where = {
        deletedAt: null,
        ...scopeFilter,
        dueDate: { gte: calStart, lte: calEnd },
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
          projectId: true,
        },
        orderBy: { dueDate: "asc" },
      });
      return NextResponse.json(
        tasks.map((t) => ({
          id: t.id,
          title: t.title,
          dueDate: t.dueDate.toISOString(),
          isCompleted: t.isCompleted,
          status: t.status,
          projectId: t.projectId,
        }))
      );
    }

    const orderBy = [{ parentId: "asc" as const }, { orderIndex: "asc" as const }, { isCompleted: "asc" as const }, { dueDate: "asc" as const }];

    // [PERF-auto] 일기 탭 등 특정 일 마감만 — tasks?all=1 없이 범위 조회
    const dueDayParam = searchParams.get("dueDay");
    if (dueDayParam && /^\d{4}-\d{2}-\d{2}$/.test(dueDayParam)) {
      const anchor = parse(dueDayParam, "yyyy-MM-dd", new Date());
      if (!Number.isNaN(anchor.getTime())) {
        const d0 = startOfDay(anchor);
        const d1 = endOfDay(anchor);
        const whereDueDay = { ...baseWhere, dueDate: { gte: d0, lte: d1 } };
        const tasksDueDay = await prisma.task.findMany({
          where: whereDueDay,
          select: listSelect,
          orderBy,
        });
        return NextResponse.json(
          tasksDueDay.map((t) => mapListItem(t as unknown as Record<string, unknown>))
        );
      }
    }

    const all = searchParams.get("all") === "1";

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
      { error: "프로젝트 목록을 불러올 수 없습니다." },
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
      console.error("[tasks POST] validation failed", {
        issues: parsed.error.issues,
        flatten: parsed.error.flatten(),
      });
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
        description:
          parsed.data.description === undefined ? null : parsed.data.description,
        dueDate: parsed.data.dueDate,
        priority: parsed.data.priority ?? "MEDIUM",
        status: parsed.data.status ?? "TODO",
        assigneeIds: parsed.data.assigneeIds,
        assignedToId: parsed.data.assignedToId ?? undefined,
        parentId: parsed.data.parentId ?? null,
        categoryId: parsed.data.categoryId ?? null,
        orderIndex: parsed.data.orderIndex ?? 0,
        projectId: parsed.data.projectId ?? null,
      },
    });

    return NextResponse.json(jsonSerializeCreatedTask(task));
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "프로젝트를 저장할 수 없습니다." },
      { status: 500 }
    );
  }
}
