import prisma from "@/lib/prisma";
import { todayYmdKst } from "@/lib/date-kst";
import type { Prisma, TaskPriority, TaskStatus } from "@prisma/client";
import type { WorkspaceScope } from "@/lib/workspace";
import { isPrismaTaskColorColumnMissing } from "@/lib/prisma-task-color-fallback";
import { appendWorkLogOnceForTaskStatus, createActivityLog } from "@/lib/activity-log";
import { createNotificationWithOptions } from "@/lib/notifications";
import {
  normalizeAssigneeIds,
  serializeAssigneesFromRows,
  taskAssigneeUserSelect,
} from "@/lib/task-assignees";

export type CreateTaskInput = {
  title: string;
  description?: string | null;
  /** YYYY-MM-DD 또는 ISO 문자열 (기존 /api/tasks 와 동일) */
  dueDate: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  /** 다중 담당 (우선). 없으면 assignedToId 단일·본인 폴백 */
  assigneeIds?: string[];
  assignedToId?: string;
  parentId?: string | null;
  categoryId?: string | null;
  orderIndex?: number;
  projectId?: string | null;
  isRecurring?: boolean;
  recurringDays?: string | null;
  recurringMemo?: string | null;
  color?: string | null;
};

const taskInclude = {
  assignedTo: { select: taskAssigneeUserSelect },
  createdBy: { select: { name: true, position: true } },
  assignees: {
    select: { user: { select: taskAssigneeUserSelect } },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

export type CreatedTaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

/**
 * POST /api/tasks 와 동일: Task 생성 + 활동 로그 + 업무일지 1회 + 담당자 알림
 */
export async function createTaskWithNotifications(params: {
  createdById: string;
  scope: WorkspaceScope;
  data: CreateTaskInput;
}): Promise<CreatedTaskWithRelations> {
  const { createdById, scope, data } = params;

  const ids = normalizeAssigneeIds(data.assigneeIds, data.assignedToId, createdById);
  const primaryAssignee = ids[0] ?? createdById;

  const isRecurring = Boolean(data.isRecurring);
  const recurringDays =
    isRecurring && (data.recurringDays == null || data.recurringDays === "")
      ? "[1,2,3,4,5]"
      : isRecurring
        ? data.recurringDays
        : null;
  const recurringMemo = isRecurring ? (data.recurringMemo?.trim() ? data.recurringMemo.trim() : null) : null;

  const taskScope: WorkspaceScope = scope === "PERSONAL" ? "PERSONAL" : "TEAM";
  const taskCreateInner = {
    title: data.title,
    description: data.description ?? null,
    dueDate: new Date(data.dueDate),
    priority: data.priority ?? "MEDIUM",
    status: data.status ?? "TODO",
    assignedToId: primaryAssignee,
    createdById,
    projectId: data.projectId ?? null,
    parentId: data.parentId ?? null,
    categoryId: data.categoryId ?? null,
    orderIndex: data.orderIndex ?? 0,
    scope: taskScope,
    isRecurring,
    recurringDays,
    recurringMemo,
    assignees: {
      create: ids.map((userId) => ({ userId })),
    },
  };
  const taskCreateData =
    data.color !== undefined
      ? { ...taskCreateInner, color: data.color }
      : taskCreateInner;

  let task: CreatedTaskWithRelations;
  try {
    task = (await prisma.task.create({
      data: taskCreateData as Prisma.TaskUncheckedCreateInput,
      include: taskInclude,
    })) as CreatedTaskWithRelations;
  } catch (e) {
    if (!isPrismaTaskColorColumnMissing(e)) throw e;
    // color 컬럼 없음: create 응답 SELECT에서도 color 제외 (omit은 타입상 any)
    task = (await (prisma.task.create as any)({
      data: taskCreateInner as Prisma.TaskUncheckedCreateInput,
      include: taskInclude,
      omit: { color: true },
    })) as CreatedTaskWithRelations;
  }

  const dueDateStr = data.dueDate.slice(0, 10);
  const timestampForLog = dueDateStr ? new Date(dueDateStr + "T12:00:00") : undefined;
  await createActivityLog(
    createdById,
    "TASK_CREATED",
    task.title,
    undefined,
    timestampForLog ? { timestamp: timestampForLog } : undefined
  );

  void appendWorkLogOnceForTaskStatus({
    userId: createdById,
    dateStr: todayYmdKst(),
    taskId: task.id,
    taskTitle: task.title,
    status: (task.status as "TODO" | "IN_PROGRESS" | "DONE") ?? "TODO",
  });

  for (const uid of ids) {
    if (uid && uid !== createdById) {
      await createNotificationWithOptions({
        userId: uid,
        type: "ASSIGNED",
        message: `'${task.title}' 프로젝트가 배정되었습니다.`,
        link: `/tasks/${task.id}`,
        actorId: createdById,
      });
    }
  }

  return task;
}

/** API JSON 직렬화: prisma assignees 행 → assignees + assignedTo */
export function jsonSerializeCreatedTask(task: CreatedTaskWithRelations) {
  const { assignees: rows, ...rest } = task;
  const { assignees, assignedTo } = serializeAssigneesFromRows(rows, rest.assignedTo);
  return { ...rest, assignees, assignedTo };
}
