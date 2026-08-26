import { isExpiredByAsOf } from "@/lib/leave/kst-date";
import { LEGACY_CARRY_ACCRUAL_YMD } from "@/lib/leave/legacy-carry-sync";

export type PeriodGrantedInput = {
  type: string;
  days: number;
  accrualDateYmd: string;
  expiresAt: Date;
  isExpired: boolean;
};

export type PeriodGrantedBreakdown = {
  /** 현재 적용기간 발생 days 합 */
  periodGranted: number;
  /** 직전 적용기간 발생분 중 미만료 = 유효 이월(작년만) */
  validCarry: number;
  /** 화면·annualTotal용: periodGranted + validCarry */
  displayGranted: number;
  /** 참고: 만료되어 제외된 days 합 */
  excludedExpired: number;
  /** 직전 기간보다 오래된·미만료분(이월 대상 아님) */
  excludedStaleCarry: number;
};

function inYmdRange(
  ymd: string,
  range: { start: string; end: string } | null | undefined
): boolean {
  if (!range?.start || !range?.end) return false;
  return ymd >= range.start && ymd <= range.end;
}

/**
 * 발생(이월) 표시용 — 입사기념일 기준.
 * - 현재 적용기간 발생
 * - + 직전 적용기간 발생 중 미만료만 유효 이월(그 이전분은 이월 제외)
 * - 만료분 제외
 */
export function computePeriodDisplayGranted(
  accruals: PeriodGrantedInput[],
  period: { start: string; end: string },
  asOf: Date,
  previousPeriod?: { start: string; end: string } | null
): PeriodGrantedBreakdown {
  let periodGranted = 0;
  let validCarry = 0;
  let excludedExpired = 0;
  let excludedStaleCarry = 0;

  for (const row of accruals) {
    if (row.type === "CARRY_OVER" && row.accrualDateYmd === LEGACY_CARRY_ACCRUAL_YMD) {
      continue;
    }
    const expired = row.isExpired || isExpiredByAsOf(row.expiresAt, asOf);
    const inPeriod = inYmdRange(row.accrualDateYmd, period);

    if (inPeriod) {
      periodGranted += row.days;
      continue;
    }
    if (expired) {
      excludedExpired += row.days;
      continue;
    }
    if (inYmdRange(row.accrualDateYmd, previousPeriod ?? null)) {
      validCarry += row.days;
      continue;
    }
    // 기간 밖·미만료이지만 직전 기간보다 오래됨 → 이월 안 함
    excludedStaleCarry += row.days;
  }

  return {
    periodGranted,
    validCarry,
    displayGranted: periodGranted + validCarry,
    excludedExpired,
    excludedStaleCarry,
  };
}
