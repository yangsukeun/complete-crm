import prisma from "@/lib/prisma";
import { eachKstYmdInclusive, toKstYmd } from "@/lib/date-kst";
import { addCalendarDaysKst, addCalendarMonthsKst, startOfKstDayFromYmd } from "@/lib/leave/kst-date";

function isWeekdayYmd(ymd: string): boolean {
  // Use noon KST for weekday
  const k = new Date(`${ymd}T12:00:00+09:00`);
  const day = k.getUTCDay();
  return day !== 0 && day !== 6;
}

/** KST 구간 [startYmd, endYmd] 소정근로일(주말 제외) 수 */
export function countScheduledWeekdaysInclusive(startYmd: string, endYmd: string): number {
  let n = 0;
  for (const ymd of eachKstYmdInclusive(startYmd, endYmd)) {
    if (isWeekdayYmd(ymd)) n++;
  }
  return n;
}

const COUNTABLE = new Set(["PRESENT", "LATE", "LEAVE"]);

/**
 * 해당 KST 기간의 출근율이 threshold 이상이면 true.
 * 기록이 전혀 없으면 true(레거시 데이터 없는 설치 호환).
 */
export async function isAttendanceRateOk(
  userId: string,
  startYmd: string,
  endYmd: string,
  threshold: number
): Promise<boolean> {
  const scheduled = countScheduledWeekdaysInclusive(startYmd, endYmd);
  if (scheduled <= 0) return true;

  const start = startOfKstDayFromYmd(startYmd);
  const end = startOfKstDayFromYmd(endYmd);
  const endExclusive = new Date(end.getTime() + 24 * 60 * 60 * 1000);

  const rows = await prisma.attendance.findMany({
    where: {
      userId,
      date: { gte: start, lt: endExclusive },
    },
    select: { date: true, status: true },
  });

  if (rows.length === 0) return true;

  const dayToStatus = new Map<string, string>();
  for (const r of rows) {
    dayToStatus.set(toKstYmd(r.date), r.status);
  }

  let attended = 0;
  for (const ymd of eachKstYmdInclusive(startYmd, endYmd)) {
    if (!isWeekdayYmd(ymd)) continue;
    const st = dayToStatus.get(ymd);
    if (st && COUNTABLE.has(st)) attended++;
  }

  return attended / scheduled >= threshold - 1e-9;
}

/** n번째 월차 구간 [입사+(n-1)개월일, 입사+n개월일 전날] KST */
export function monthlyAttendanceWindowYmd(joinYmd: string, monthIndex1Based: number): { startYmd: string; endYmd: string } {
  if (monthIndex1Based === 1) {
    const endExclusiveYmd = addCalendarMonthsKst(joinYmd, 1);
    const endYmd = addCalendarDaysKst(endExclusiveYmd, -1);
    return { startYmd: joinYmd, endYmd };
  }
  const startYmd = addCalendarMonthsKst(joinYmd, monthIndex1Based - 1);
  const endExclusiveYmd = addCalendarMonthsKst(joinYmd, monthIndex1Based);
  const endYmd = addCalendarDaysKst(endExclusiveYmd, -1);
  return { startYmd, endYmd };
}
