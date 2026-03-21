import { format } from "date-fns";
import prisma from "@/lib/prisma";
import type { Prisma, TaskPriority, TaskStatus } from "@prisma/client";
import type { WorkspaceScope } from "@/lib/workspace";
import { appendWorkLogOnceForTaskStatus, createActivityLog } from "@/lib/activity-log";
import { createNotificationWithOptions } from "@/lib/notifications";

export type CreateTaskInput = {
  title: string;
  description?: string | null;
  /** YYYY-MM-DD 또는 ISO 문자열 (기존 /api/tasks 와 동일) */
  dueDate: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  assignedToId?: string;
  parentId?: string | null;
  categoryId?: string | null;
  orderIndex?: number;
};

const taskInclude = {
  assignedTo: { select: { name: true, position: true } },
  createdBy: { select: { name: true, position: true } },
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

  const task = await prisma.task.create({
    data: {
      title: data.title,
      description: data.description ?? null,
      dueDate: new Date(data.dueDate),
      priority: data.priority ?? "MEDIUM",
      status: data.status ?? "TODO",
      assignedToId: data.assignedToId || createdById,
      createdById,
      parentId: data.parentId ?? null,
      categoryId: data.categoryId ?? null,
      orderIndex: data.orderIndex ?? 0,
      scope: scope === "PERSONAL" ? "PERSONAL" : "TEAM",
    },
    include: taskInclude,
  });

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
    dateStr: format(new Date(), "yyyy-MM-dd"),
    taskId: task.id,
    taskTitle: task.title,
    status: (task.status as "TODO" | "IN_PROGRESS" | "DONE") ?? "TODO",
  });

  if (task.assignedToId && task.assignedToId !== createdById) {
    await createNotificationWithOptions({
      userId: task.assignedToId,
      type: "ASSIGNED",
      message: `'${task.title}' 업무가 배정되었습니다.`,
      link: `/tasks/${task.id}`,
      actorId: createdById,
    });
  }

  return task;
}
