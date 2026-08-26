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
  /** 기간 밖이지만 아직 유효(미만료)인 발생 = 유효 이월 */
  validCarry: number;
  /** 화면·annualTotal용: periodGranted + validCarry */
  displayGranted: number;
  /** 참고: 만료되어 제외된 days 합(생애 누적에서 빠지는 분) */
  excludedExpired: number;
};

/**
 * 발생(이월) 표시용.
 * - 현재 적용기간(accrualDateYmd ∈ [start,end]) 발생
 * - + 기간 밖·미만료 잔여 발생분(유효 이월)
 * - 만료분 생애 누적 제외
 */
export function computePeriodDisplayGranted(
  accruals: PeriodGrantedInput[],
  period: { start: string; end: string },
  asOf: Date
): PeriodGrantedBreakdown {
  let periodGranted = 0;
  let validCarry = 0;
  let excludedExpired = 0;

  for (const row of accruals) {
    if (row.type === "CARRY_OVER" && row.accrualDateYmd === LEGACY_CARRY_ACCRUAL_YMD) {
      continue;
    }
    const expired = row.isExpired || isExpiredByAsOf(row.expiresAt, asOf);
    const inPeriod =
      Boolean(period.start) &&
      Boolean(period.end) &&
      row.accrualDateYmd >= period.start &&
      row.accrualDateYmd <= period.end;

    if (inPeriod) {
      periodGranted += row.days;
      continue;
    }
    if (expired) {
      excludedExpired += row.days;
      continue;
    }
    validCarry += row.days;
  }

  return {
    periodGranted,
    validCarry,
    displayGranted: periodGranted + validCarry,
    excludedExpired,
  };
}
