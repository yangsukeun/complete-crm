import { NextResponse } from "next/server";
import { subDays, subHours } from "date-fns";
import prisma from "@/lib/prisma";
import { verifyCronRequest } from "@/lib/cron-auth";
import { hasTaskNotificationLog, insertNotificationLogs } from "@/lib/notification-log";
import { createNotificationsForManyUsers } from "@/lib/notifications";

export const runtime = "nodejs";

function uniqueIds(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((x): x is string => Boolean(x)))];
}

/** 담당자 미지정 업무 → 생성자·임원/관리자 알림 (KST 10:00 대응 UTC 01:00) */
export async function GET(req: Request) {
  const denied = verifyCronRequest(req);
  if (denied) return denied;

  const now = new Date();
  const createdBefore = subHours(now, 24);
  const logSince = subDays(now, 7);

  const admins = await prisma.user.findMany({
    where: { role: { in: ["EXECUTIVE", "ADMIN"] } },
    select: { id: true },
  });
  const adminIds = admins.map((a) => a.id);

  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      archivedAt: null,
      status: { not: "DONE" },
      isCompleted: false,
      createdAt: { lt: createdBefore },
      assignedToId: null,
      assignees: { none: {} },
    },
    select: { id: true, title: true, createdById: true },
  });

  let sentTasks = 0;
  let notifiedUsers = 0;

  for (const task of tasks) {
    if (await hasTaskNotificationLog(task.id, "ORPHAN", logSince)) continue;

    const recipients = uniqueIds([task.createdById, ...adminIds]);
    if (recipients.length === 0) continue;

    const link = `/tasks/${task.id}`;
    const message = `담당자 미지정 업무가 있습니다: ${task.title}`;

    await createNotificationsForManyUsers({
      userIds: recipients,
      type: "TASK_ORPHAN",
      message,
      link,
    });

    await insertNotificationLogs(
      recipients.map((userId) => ({ userId, taskId: task.id, kind: "ORPHAN" as const }))
    );

    sentTasks += 1;
    notifiedUsers += recipients.length;
  }

  console.log("[detect-orphan-tasks] tasks:", sentTasks, "notification rows:", notifiedUsers);
  return NextResponse.json({ ok: true, tasks: sentTasks, notifications: notifiedUsers });
}
