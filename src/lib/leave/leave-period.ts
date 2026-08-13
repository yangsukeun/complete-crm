import { completedFullMonthsSinceJoinKst } from "@/lib/leave";
import { addCalendarDaysKst, addCalendarMonthsKst } from "@/lib/leave/kst-date";

/** 입사기념일 기준 현재 적용 기간 (KST yyyy-MM-dd) */
export function currentLeavePeriodYmd(
  joinYmd: string,
  asOfYmd: string
): { start: string; end: string } {
  const months = completedFullMonthsSinceJoinKst(joinYmd, asOfYmd);
  const years = Math.floor(months / 12);
  const start = addCalendarMonthsKst(joinYmd, years * 12);
  const next = addCalendarMonthsKst(joinYmd, (years + 1) * 12);
  return { start, end: addCalendarDaysKst(next, -1) };
}
