import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import prisma from "@/lib/prisma";
import { verifyCronRequest } from "@/lib/cron-auth";
import {
  addDaysKstYmd,
  kstDateBoundsUtc,
  previousKstYmd,
  todayYmdKst,
} from "@/lib/date-kst";
import {
  hasDueAlertLog,
  insertNotificationLogs,
  type NotificationLogKind,
} from "@/lib/notification-log";
import { createNotification } from "@/lib/notifications";
import type { NotificationTypeEnum } from "@/lib/notifications";

export const runtime = "nodejs";

type DueKind = "DUE_D3" | "DUE_DDAY" | "DUE_PLUS1";

const KIND_TO_TYPE: Record<DueKind, NotificationTypeEnum> = {
  DUE_D3: "TASK_DUE_D3",
  DUE_DDAY: "TASK_DUE_D1",
  DUE_PLUS1: "TASK_DUE_OVERDUE",
};

function unique(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

function taskAssigneeIds(task: {
  assignedToId: string | null;
  assignees: { userId: string }[];
}): string[] {
  return unique([
    ...(task.assignedToId ? [task.assignedToId] : []),
    ...task.assignees.map((a) => a.userId),
  ]);
}

async function adminExecutiveIds(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { role: { in: ["EXECUTIVE", "ADMIN"] } },
    select: { id: true },
  });
  return rows.map((u) => u.id);
}

function messageFor(kind: DueKind, title: string, entity: "task" | "project"): string {
  const label = entity === "project" ? "프로젝트" : "할일";
  if (kind === "DUE_D3") return `[${label}] 마감 3일 전입니다: ${title}`;
  if (kind === "DUE_DDAY") return `[${label}] 오늘 마감입니다: ${title}`;
  return `[${label}] 마감이 하루 지났습니다: ${title}`;
}

async function notifyRecipients(opts: {
  kind: DueKind;
  recipients: string[];
  title: string;
  link: string;
  entity: "task" | "project";
  taskId?: string | null;
  projectId?: string | null;
}): Promise<number> {
  const { kind, recipients, title, link, entity, taskId, projectId } = opts;
  if (recipients.length === 0) return 0;
  if (await hasDueAlertLog({ kind, taskId, projectId })) return 0;

  const message = messageFor(kind, title, entity);
  const type = KIND_TO_TYPE[kind];
  for (const userId of recipients) {
    await createNotification(userId, type, message, link);
  }
  await insertNotificationLogs(
    recipients.map((userId) => ({
      userId,
      taskId: taskId ?? null,
      projectId: projectId ?? null,
      kind: kind as NotificationLogKind,
    }))
  );
  return recipients.length;
}

async function processTasksForDay(opts: {
  kind: DueKind;
  dayStart: Date;
  dayEnd: Date;
  includeAdmins: boolean;
}): Promise<number> {
  const { kind, dayStart, dayEnd, includeAdmins } = opts;
  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      archivedAt: null,
      isCompleted: false,
      status: { not: "DONE" },
      dueDate: { gte: dayStart, lt: dayEnd },
      OR: [{ assignedToId: { not: null } }, { assignees: { some: {} } }],
    },
    select: {
      id: true,
      title: true,
      assignedToId: true,
      assignees: { select: { userId: true } },
    },
  });

  const admins = includeAdmins ? await adminExecutiveIds() : [];
  let rows = 0;
  for (const task of tasks) {
    const assignees = taskAssigneeIds(task);
    if (assignees.length === 0) continue;
    const recipients = includeAdmins ? unique([...assignees, ...admins]) : assignees;
    rows += await notifyRecipients({
      kind,
      recipients,
      title: task.title,
      link: `/tasks/${task.id}`,
      entity: "task",
      taskId: task.id,
    });
  }
  return rows;
}

async function processProjectsForDay(opts: {
  kind: DueKind;
  dayStart: Date;
  dayEnd: Date;
  includeAdmins: boolean;
}): Promise<number> {
  const { kind, dayStart, dayEnd, includeAdmins } = opts;
  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      status: { not: "COMPLETED" },
      dueDate: { gte: dayStart, lt: dayEnd },
      users: { some: {} },
    },
    select: {
      id: true,
      name: true,
      users: { select: { id: true } },
    },
  });

  const admins = includeAdmins ? await adminExecutiveIds() : [];
  let rows = 0;
  for (const project of projects) {
    const assignees = unique(project.users.map((u) => u.id));
    if (assignees.length === 0) continue;
    const recipients = includeAdmins ? unique([...assignees, ...admins]) : assignees;
    rows += await notifyRecipients({
      kind,
      recipients,
      title: project.name,
      link: `/projects/${project.id}`,
      entity: "project",
      projectId: project.id,
    });
  }
  return rows;
}

/**
 * D-3 / D-DAY / D+1 마감 알림 (할일 + 프로젝트).
 * 스케줄: UTC 00:00 = KST 09:00
 * - D-3·D-DAY: 담당자만 (DB + OneSignal)
 * - D+1: 담당자 + ADMIN/EXECUTIVE
 */
export async function GET(req: Request) {
  const denied = verifyCronRequest(req);
  if (denied) return denied;

  try {
    const today = todayYmdKst();
    const d3 = addDaysKstYmd(today, 3);
    const yesterday = previousKstYmd(today);

    const d3b = kstDateBoundsUtc(d3);
    const todayB = kstDateBoundsUtc(today);
    const yB = kstDateBoundsUtc(yesterday);

    const [t3, p3, td, pd, t1, p1] = await Promise.all([
      processTasksForDay({ kind: "DUE_D3", dayStart: d3b.start, dayEnd: d3b.end, includeAdmins: false }),
      processProjectsForDay({ kind: "DUE_D3", dayStart: d3b.start, dayEnd: d3b.end, includeAdmins: false }),
      processTasksForDay({ kind: "DUE_DDAY", dayStart: todayB.start, dayEnd: todayB.end, includeAdmins: false }),
      processProjectsForDay({ kind: "DUE_DDAY", dayStart: todayB.start, dayEnd: todayB.end, includeAdmins: false }),
      processTasksForDay({ kind: "DUE_PLUS1", dayStart: yB.start, dayEnd: yB.end, includeAdmins: true }),
      processProjectsForDay({ kind: "DUE_PLUS1", dayStart: yB.start, dayEnd: yB.end, includeAdmins: true }),
    ]);

    const summary = {
      ok: true,
      DUE_D3: t3 + p3,
      DUE_DDAY: td + pd,
      DUE_PLUS1: t1 + p1,
      tasks: { DUE_D3: t3, DUE_DDAY: td, DUE_PLUS1: t1 },
      projects: { DUE_D3: p3, DUE_DDAY: pd, DUE_PLUS1: p1 },
    };
    console.log("[due-date-alerts]", summary);
    return NextResponse.json(summary);
  } catch (e) {
    console.error("[due-date-alerts]", e);
    Sentry.captureException(e);
    return NextResponse.json({ ok: false, error: "due-date-alerts failed" }, { status: 500 });
  }
}
