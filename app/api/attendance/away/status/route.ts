import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAppSession } from "@/auth";
import { startOfDayKst } from "@/lib/date-kst";
import { summarizeAwayLogs } from "@/lib/attendance-away-access";

export const runtime = "nodejs";

/** 본인 이석 상태. 권한 없는 직원도 200 + open:false (오버레이 복원용). */
export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const todayStart = startOfDayKst(new Date());
    const logs = await prisma.awayLog.findMany({
      where: { userId: session.user.id, startedAt: { gte: todayStart } },
      select: { id: true, type: true, startedAt: true, endedAt: true },
    });
    const summary = summarizeAwayLogs(logs);
    if (!summary.open) {
      return NextResponse.json({
        open: false,
        todayEndedMs: summary.todayEndedMs,
        bathroomEndedMs: summary.bathroomEndedMs,
        smokingEndedMs: summary.smokingEndedMs,
      });
    }
    return NextResponse.json({
      open: true,
      id: summary.open.id,
      type: summary.open.type,
      startedAt: summary.open.startedAt,
      todayEndedMs: summary.todayEndedMs,
      bathroomEndedMs: summary.bathroomEndedMs,
      smokingEndedMs: summary.smokingEndedMs,
    });
  } catch (e) {
    console.error("away status:", e);
    return NextResponse.json({ error: "이석 상태를 불러오지 못했습니다." }, { status: 500 });
  }
}
