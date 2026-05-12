import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { accrueIfDueAllActiveUsers } from "@/lib/leave/accrue";
import { expireDueAccruals } from "@/lib/leave/expire";
import { addDays } from "date-fns";
import { createNotificationWithOptions } from "@/lib/notifications";
import { startOfKstDay } from "@/lib/leave/kst-date";
import { toKstYmd } from "@/lib/date-kst";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

/** KST 기준 30일 내 소멸 예정(잔여>0) 알림 */
async function notifyExpiringSoon(asOf: Date): Promise<number> {
  const boundary = startOfKstDay(asOf);
  const until = addDays(boundary, 30);
  const rows = await prisma.leaveAccrual.findMany({
    where: {
      isExpired: false,
      expiresAt: { gt: boundary, lte: until },
    },
    select: { userId: true, expiresAt: true, days: true, consumedDays: true },
  });
  let n = 0;
  for (const r of rows) {
    const rem = Math.max(0, r.days - r.consumedDays);
    if (rem <= 0.0001) continue;
    await createNotificationWithOptions({
      userId: r.userId,
      type: "LEAVE_REQUEST",
      message: `연차·월차 ${rem.toFixed(1)}일이 ${toKstYmd(r.expiresAt)} 이전에 소멸 예정입니다. 사용 계획을 확인해 주세요.`,
      link: "/leave",
    });
    n++;
  }
  return n;
}

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
