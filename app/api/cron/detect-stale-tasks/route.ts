import { NextResponse } from "next/server";
import { subDays } from "date-fns";
import prisma from "@/lib/prisma";
import { verifyCronRequest } from "@/lib/cron-auth";
import { toKstYmd } from "@/lib/date-kst";
import { hasTaskNotificationLog, insertNotificationLogs } from "@/lib/notification-log";
import { createNotificationsForManyUsers } from "@/lib/notifications";

export const runtime = "nodejs";

function assigneeUserIds(task: {
  assignedToId: string | null;
  assignees: { userId: string }[];
}): string[] {
  const raw = [...(task.assignedToId ? [task.assignedToId] : []), ...task.assignees.map((a) => a.userId)];
  return [...new Set(raw)].filter(Boolean);
}

/** 진행 중이나 7일간 댓글·수정·업무일지 상태 마커가 없는 업무 → 담당자에게 (주간) */
export async function GET(req: Request) {
  const denied = verifyCronRequest(req);
  if (denied) return denied;

  const now = new Date();
  const sevenAgo = subDays(now, 7);
  const sevenKstYmd = toKstYmd(sevenAgo);
  const logSince = subDays(now, 14);

  const staleRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT t.id
    FROM "Task" t
    WHERE t.status = 'IN_PROGRESS'
      AND t."archivedAt" IS NULL
      AND t."deletedAt" IS NULL
      AND t."updatedAt" < ${sevenAgo}
      AND NOT EXISTS (
        SELECT 1 FROM "TaskComment" c
        WHERE c."taskId" = t.id AND c."createdAt" >= ${sevenAgo}
      )
      AND NOT EXISTS (
        SELECT 1 FROM "DailyWorkLog" d
        WHERE d.date >= ${sevenKstYmd}
          AND d.content LIKE ('%' || '<!--task-status:' || t.id || ':%')
      )
  `;

  const ids = staleRows.map((r) => r.id);
  if (ids.length === 0) {
    console.log("[detect-stale-tasks] stale task count: 0");
    return NextResponse.json({ ok: true, tasks: 0, notifications: 0 });
  }

  const tasks = await prisma.task.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      title: true,
      assignedToId: true,
      assignees: { select: { userId: true } },
    },
  });

  let sentTasks = 0;
  let notifiedUsers = 0;

  for (const task of tasks) {
    if (await hasTaskNotificationLog(task.id, "STALE", logSince)) continue;

    const recipients = assigneeUserIds(task);
    if (recipients.length === 0) continue;

    const link = `/tasks/${task.id}`;
    const message = `진행 중 업무가 1주일째 움직이지 않습니다: ${task.title}`;

    await createNotificationsForManyUsers({
      userIds: recipients,
      type: "STAGNANT",
      message,
      link,
    });

    await insertNotificationLogs(
      recipients.map((userId) => ({ userId, taskId: task.id, kind: "STALE" as const }))
    );

    sentTasks += 1;
    notifiedUsers += recipients.length;
  }

  console.log("[detect-stale-tasks] tasks:", sentTasks, "notification rows:", notifiedUsers);
  return NextResponse.json({ ok: true, tasks: sentTasks, notifications: notifiedUsers });
}
