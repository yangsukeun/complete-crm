import { NextResponse } from "next/server";
import { addDays, addHours, subDays, subHours } from "date-fns";
import prisma from "@/lib/prisma";
import { verifyCronRequest } from "@/lib/cron-auth";
import { hasTaskNotificationLog, insertNotificationLogs, type NotificationLogKind } from "@/lib/notification-log";
import { createNotification } from "@/lib/notifications";
import type { NotificationTypeEnum } from "@/lib/notifications";

export const runtime = "nodejs";

function assigneeIds(task: {
  assignedToId: string | null;
  assignees: { userId: string }[];
}): string[] {
  const raw = [...(task.assignedToId ? [task.assignedToId] : []), ...task.assignees.map((a) => a.userId)];
  return [...new Set(raw)].filter(Boolean);
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

type DueKind = "DUE_D3" | "DUE_D1" | "DUE_DAY";

const KIND_TO_LOG: Record<DueKind, NotificationLogKind> = {
  DUE_D3: "DUE_D3",
  DUE_D1: "DUE_D1",
  DUE_DAY: "DUE_DAY",
};

const KIND_TO_TYPE: Record<DueKind, NotificationTypeEnum> = {
  DUE_D3: "TASK_DUE_D3",
  DUE_D1: "TASK_DUE_D1",
  DUE_DAY: "TASK_DUE_OVERDUE",
};

async function processDueBucket(params: {
  kind: DueKind;
  where: { dueDate: { gte: Date; lt: Date } } | { dueDate: { lt: Date; gt: Date } };
  assigneesOnly: boolean;
  requireAssigneeForQuery: boolean;
  now: Date;
}): Promise<number> {
  const { kind, where, assigneesOnly, requireAssigneeForQuery, now } = params;
  const logSince = subHours(now, 24);

  const assigneeScope = requireAssigneeForQuery
    ? {
        OR: [{ assignedToId: { not: null } }, { assignees: { some: { userId: { not: "" } } } }],
      }
    : {};

  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      archivedAt: null,
      isCompleted: false,
      status: { not: "DONE" },
      ...where,
      ...assigneeScope,
    },
    select: {
      id: true,
      title: true,
      dueDate: true,
      createdById: true,
      assignedToId: true,
      assignees: { select: { userId: true } },
    },
  });

  let rows = 0;
  const admins = assigneesOnly
    ? []
    : (await prisma.user.findMany({
        where: { role: { in: ["EXECUTIVE", "ADMIN"] } },
        select: { id: true },
      })).map((u) => u.id);

  for (const task of tasks) {
    if (!task.dueDate) continue;
    if (await hasTaskNotificationLog(task.id, KIND_TO_LOG[kind], logSince)) continue;

    const assignees = assigneeIds(task);
    if (assigneesOnly && assignees.length === 0) continue;

    const recipients = assigneesOnly
      ? assignees
      : unique([...assignees, ...admins, ...(task.createdById ? [task.createdById] : [])]);
    if (recipients.length === 0) continue;

    const link = `/tasks/${task.id}`;
    let message: string;
    if (kind === "DUE_D3") {
      message = `마감 3일 전입니다: ${task.title}`;
    } else if (kind === "DUE_D1") {
      message = `마감 1일 전입니다: ${task.title}`;
    } else {
      message = `마감일이 지났습니다: ${task.title}`;
    }

    for (const userId of recipients) {
      await createNotification(userId, KIND_TO_TYPE[kind], message, link);
    }

    await insertNotificationLogs(
      recipients.map((userId) => ({ userId, taskId: task.id, kind: KIND_TO_LOG[kind] }))
    );

    rows += recipients.length;
  }

  return rows;
}

/** D-3 / D-1 / 마감 직후 24h 윈도우 경보 (KST 09:00 대응 UTC 00:00) */
export async function GET(req: Request) {
  const denied = verifyCronRequest(req);
  if (denied) return denied;

  const now = new Date();

  const d3Start = addDays(now, 3);
  const d3End = addHours(d3Start, 1);
  const d1Start = addDays(now, 1);
  const d1End = addHours(d1Start, 1);
  const overdueStart = subDays(now, 1);

  const n3 = await processDueBucket({
    kind: "DUE_D3",
    where: { dueDate: { gte: d3Start, lt: d3End } },
    assigneesOnly: true,
    requireAssigneeForQuery: true,
    now,
  });
  const n1 = await processDueBucket({
    kind: "DUE_D1",
    where: { dueDate: { gte: d1Start, lt: d1End } },
    assigneesOnly: true,
    requireAssigneeForQuery: true,
    now,
  });
  const nd = await processDueBucket({
    kind: "DUE_DAY",
    where: { dueDate: { lt: now, gt: overdueStart } },
    assigneesOnly: false,
    requireAssigneeForQuery: false,
    now,
  });

  console.log("[due-date-alerts] DUE_D3:", n3, "DUE_D1:", n1, "DUE_DAY:", nd);
  return NextResponse.json({ ok: true, DUE_D3: n3, DUE_D1: n1, DUE_DAY: nd });
}
