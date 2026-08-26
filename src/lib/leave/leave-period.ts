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

/**
 * 입사기념일 기준 직전 적용 기간.
 * 1년 미만(현재가 첫 기간)이면 null — 이월 없음.
 */
export function previousLeavePeriodYmd(
  joinYmd: string,
  asOfYmd: string
): { start: string; end: string } | null {
  const months = completedFullMonthsSinceJoinKst(joinYmd, asOfYmd);
  const years = Math.floor(months / 12);
  if (years < 1) return null;
  const start = addCalendarMonthsKst(joinYmd, (years - 1) * 12);
  const next = addCalendarMonthsKst(joinYmd, years * 12);
  return { start, end: addCalendarDaysKst(next, -1) };
}

/**
 * 사용·표시 가능한 발생 하한일(KST).
 * 직전 기간이 있으면 그 시작일, 없으면 현재 기간 시작일(=입사일).
 * → 직전 기간보다 오래된 발생분은 이월·잔여에서 제외.
 */
export function usableAccrualFromYmd(joinYmd: string, asOfYmd: string): string {
  const prev = previousLeavePeriodYmd(joinYmd, asOfYmd);
  if (prev) return prev.start;
  return currentLeavePeriodYmd(joinYmd, asOfYmd).start;
}
