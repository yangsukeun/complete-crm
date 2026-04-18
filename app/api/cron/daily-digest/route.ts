import { NextResponse } from "next/server";
import { subHours } from "date-fns";
import prisma from "@/lib/prisma";
import { verifyCronRequest } from "@/lib/cron-auth";
import { kstDateBoundsUtc, startOfDayKst, todayYmdKst } from "@/lib/date-kst";
import { hasDigestSince, insertNotificationLogs } from "@/lib/notification-log";
import { sendDigestToUser } from "@/lib/notifications";

export const runtime = "nodejs";

function assigneeWhere(userId: string) {
  return {
    OR: [{ assignedToId: userId }, { assignees: { some: { userId } } }],
  };
}

async function sendDigestForUser(userId: string, now: Date, dayStart: Date, dayEnd: Date, digestDayStart: Date) {
  if (await hasDigestSince(userId, digestDayStart)) return false;

  const base = {
    deletedAt: null,
    archivedAt: null,
    isCompleted: false,
    status: { not: "DONE" as const },
  };

  const [dueToday, inProgress, mentions, overdue] = await Promise.all([
    prisma.task.count({
      where: {
        ...base,
        dueDate: { gte: dayStart, lt: dayEnd },
        ...assigneeWhere(userId),
      },
    }),
    prisma.task.count({
      where: {
        ...base,
        status: "IN_PROGRESS" as const,
        ...assigneeWhere(userId),
      },
    }),
    prisma.taskMention.count({
      where: { userId, createdAt: { gte: subHours(now, 24) } },
    }),
    prisma.task.count({
      where: {
        ...base,
        dueDate: { lt: dayStart },
        ...assigneeWhere(userId),
      },
    }),
  ]);

  if (dueToday + inProgress + mentions + overdue === 0) return false;

  const message = `오늘 업무: 마감 ${dueToday} · 진행 ${inProgress} · 새 멘션 ${mentions} · 지연 ${overdue}`;
  await sendDigestToUser({ userId, message, link: "/dashboard" });
  await insertNotificationLogs([{ userId, taskId: null, kind: "DIGEST" }]);
  return true;
}

/** 유저별 오늘 마감·진행·멘션·지연 집계 푸시 (KST 09:00 대응 UTC 00:00) */
export async function GET(req: Request) {
  const denied = verifyCronRequest(req);
  if (denied) return denied;

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
      slice.map((u) => sendDigestForUser(u.id, now, dayStart, dayEnd, digestDayStart))
    );
    sent += results.filter(Boolean).length;
  }

  console.log("[daily-digest] users notified:", sent);
  return NextResponse.json({ ok: true, digests: sent });
}
