import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import prisma from "@/lib/prisma";
import { verifyCronRequest } from "@/lib/cron-auth";
import {
  getKstWeekday,
  kstDateBoundsUtc,
  startOfDayKst,
  todayYmdKst,
} from "@/lib/date-kst";
import { hasDigestSince, insertNotificationLogs } from "@/lib/notification-log";
import { createNotificationWithOptions } from "@/lib/notifications";

export const runtime = "nodejs";

function assigneeWhere(userId: string) {
  return {
    OR: [{ assignedToId: userId }, { assignees: { some: { userId } } }],
  };
}

async function sendDigestForUser(
  userId: string,
  dayStart: Date,
  dayEnd: Date,
  digestDayStart: Date
): Promise<boolean> {
  if (await hasDigestSince(userId, digestDayStart)) return false;

  const taskBase = {
    deletedAt: null,
    archivedAt: null,
    isCompleted: false,
    status: { not: "DONE" as const },
    ...assigneeWhere(userId),
  };

  const [scheduleCount, dueTodayTasks, overdueTasks] = await Promise.all([
    prisma.schedule.count({
      where: {
        userId,
        OR: [
          { startTime: { gte: dayStart, lt: dayEnd } },
          {
            AND: [{ isAllDay: true }, { startTime: { lt: dayEnd }, endTime: { gte: dayStart } }],
          },
        ],
      },
    }),
    prisma.task.count({
      where: {
        ...taskBase,
        dueDate: { gte: dayStart, lt: dayEnd },
      },
    }),
    prisma.task.count({
      where: {
        ...taskBase,
        dueDate: { lt: dayStart },
      },
    }),
  ]);

  const dueTasks = dueTodayTasks + overdueTasks;
  if (scheduleCount === 0 && dueTasks === 0) return false;

  const message = `오늘 일정 ${scheduleCount}건 · 마감 할일 ${dueTasks}건`;
  await createNotificationWithOptions({
    userId,
    type: "DAILY_DIGEST",
    message,
    link: "/dashboard",
    pushTitle: "아침 브리핑",
  });
  await insertNotificationLogs([{ userId, taskId: null, kind: "DIGEST" }]);
  return true;
}

/** 아침 브리핑 푸시 (KST 09:00 = UTC 00:00). 주말 스킵. 일정·마감 0건이면 미발송. */
export async function GET(req: Request) {
  const denied = verifyCronRequest(req);
  if (denied) return denied;

  try {
    const weekday = getKstWeekday(new Date());
    if (weekday === 0 || weekday === 6) {
      console.log("[daily-digest] weekend skip (KST weekday=", weekday, ")");
      return NextResponse.json({ ok: true, digests: 0, skipped: "weekend" });
    }

    const now = new Date();
    const ymd = todayYmdKst();
    const { start: dayStart, end: dayEnd } = kstDateBoundsUtc(ymd);
    const digestDayStart = startOfDayKst(now);

    const users = await prisma.user.findMany({ select: { id: true } });

    const BATCH = 16;
    let sent = 0;
    for (let i = 0; i < users.length; i += BATCH) {
      const slice = users.slice(i, i + BATCH);
      const results = await Promise.all(
        slice.map((u) => sendDigestForUser(u.id, dayStart, dayEnd, digestDayStart))
      );
      sent += results.filter(Boolean).length;
    }

    console.log("[daily-digest] users notified:", sent);
    return NextResponse.json({ ok: true, digests: sent });
  } catch (e) {
    console.error("[daily-digest]", e);
    Sentry.captureException(e);
    return NextResponse.json({ ok: false, error: "daily-digest failed" }, { status: 500 });
  }
}
