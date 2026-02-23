import { differenceInMonths } from "date-fns";

/**
 * 2026년 근로기준법 기준 연차 자동 계산
 * - 1년 미만: 매월 1개 (최대 11개)
 * - 1년 이상: 15개 + 2년마다 1개 가산 (최대 25개)
 */
export function calculateTotalLeavesByLaw(hireDate: Date, referenceDate: Date = new Date()): number {
  const monthsWorked = differenceInMonths(referenceDate, hireDate);
  if (monthsWorked < 0) return 0;
  if (monthsWorked < 12) {
    return Math.min(monthsWorked, 11);
  }
  const years = Math.floor(monthsWorked / 12);
  const added = Math.floor((years - 1) / 2);
  return Math.min(15 + added, 25);
}

export function getEffectiveTotalLeaves(
  hireDate: Date | null,
  totalLeavesManual: number | null,
  totalLeavesDb: number
): number {
  if (totalLeavesManual != null) return totalLeavesManual;
  if (hireDate) return calculateTotalLeavesByLaw(hireDate);
  return totalLeavesDb;
}
