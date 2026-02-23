import { differenceInMonths, endOfYear, startOfYear } from "date-fns";

/**
 * 근로기준법(2026) 기준 연차 부여일수
 * - 1년 미만: 입사일로부터 1개월 만근 시 1일 발생 → 최대 11일
 * - 1년 이상: 15일
 * 기준일 = asOf(기본: 오늘) 기준으로 "현재까지 발생한" 연차
 * - asOf는 해당 연도 범위(start~end)로 클램프됩니다.
 */
export function getAnnualLeaveEntitlement(joinDate: Date, year: number, asOf: Date = new Date()): number {
  const join = new Date(joinDate);
  const yearStart = startOfYear(new Date(year, 0, 1));
  const yearEnd = endOfYear(new Date(year, 11, 31));
  const cutoff = asOf < yearStart ? yearStart : asOf > yearEnd ? yearEnd : asOf;

  if (join > cutoff) return 0;

  const monthsWorked = differenceInMonths(cutoff, join);
  if (monthsWorked < 1) return 0;

  if (monthsWorked < 12) {
    return Math.min(monthsWorked, 11);
  }
  return 15;
}
