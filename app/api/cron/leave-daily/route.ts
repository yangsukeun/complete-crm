import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { accrueIfDueAllActiveUsers } from "@/lib/leave/accrue";
import { expireDueAccruals } from "@/lib/leave/expire";
import { addDays } from "date-fns";
import { createNotificationWithOptions } from "@/lib/notifications";
import { startOfKstDay } from "@/lib/leave/kst-date";
import { toKstYmd } from "@/lib/date-kst";
import { hasUserKindLogSince, insertNotificationLogs } from "@/lib/notification-log";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

const EXPIRING_DEDUPE_DAYS = 7;

/** KST 기준 30일 내 소멸 예정 — 사용자당 주 1회, 잔여를 합산 */
async function notifyExpiringSoon(asOf: Date): Promise<number> {
  const boundary = startOfKstDay(asOf);
  const until = addDays(boundary, 30);
  const since = addDays(boundary, -EXPIRING_DEDUPE_DAYS);
  const rows = await prisma.leaveAccrual.findMany({
    where: {
      isExpired: false,
      expiresAt: { gt: boundary, lte: until },
    },
    select: { userId: true, expiresAt: true, days: true, consumedDays: true },
  });

  const byUser = new Map<string, { rem: number; earliest: Date }>();
  for (const r of rows) {
    const rem = Math.max(0, r.days - r.consumedDays);
    if (rem <= 0.0001) continue;
    const prev = byUser.get(r.userId);
    if (!prev) {
      byUser.set(r.userId, { rem, earliest: r.expiresAt });
    } else {
      prev.rem += rem;
      if (r.expiresAt < prev.earliest) prev.earliest = r.expiresAt;
    }
  }

  let n = 0;
  for (const [userId, agg] of byUser) {
    if (await hasUserKindLogSince(userId, "LEAVE_EXPIRING", since)) continue;
    await createNotificationWithOptions({
      userId,
      type: "LEAVE_REQUEST",
      message: `연차·월차 ${agg.rem.toFixed(1)}일이 ${toKstYmd(agg.earliest)} 이전에 소멸 예정입니다. 사용 계획을 확인해 주세요.`,
      link: "/leave",
      priority: "medium",
    });
    await insertNotificationLogs([{ userId, kind: "LEAVE_EXPIRING" }]);
    n++;
  }
  return n;
}

/** Vercel Cron 은 UTC 기준. `30 15 * * *` = 매일 15:30 UTC = 한국 00:30 (KST, 일광절약 없음). */
export async function GET(req: Request) {
  const unauthorized = verifyCronRequest(req);
  if (unauthorized) return unauthorized;

  const asOf = new Date();
  try {
    await accrueIfDueAllActiveUsers(asOf);
    const expired = await expireDueAccruals(asOf);
    const soon = await notifyExpiringSoon(asOf);
    return NextResponse.json({ ok: true, accrualTouches: true, expired, expiringSoonNotifications: soon });
  } catch (e) {
    console.error("[cron/leave-daily]", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
