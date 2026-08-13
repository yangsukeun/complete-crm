import type { LeaveAccrualType } from "@prisma/client";
import { toKstYmd } from "@/lib/date-kst";
import { addCalendarMonthsKst, isExpiredByAsOf, startOfKstDay, startOfKstDayFromYmd } from "@/lib/leave/kst-date";

export type LeavePoolBreakdown = {
  entitled: number;
  consumed: number;
  expired: number;
  available: number;
};

export type LeavePool = {
  totalEntitled: number;
  totalConsumed: number;
  totalExpired: number;
  available: number;
  compensationOwedDays: number;
  breakdown: {
    monthlyUnderOneYear: LeavePoolBreakdown;
    annualAfterOneYear: LeavePoolBreakdown;
    tenureBonus: LeavePoolBreakdown;
    carryOver: LeavePoolBreakdown;
  };
  nextAccrualDate: Date | null;
  nextExpirationDate: Date | null;
};

export type AccrualInput = {
  type: LeaveAccrualType;
  days: number;
  consumedDays: number;
  accruedAt: Date;
  expiresAt: Date;
  isExpired: boolean;
  compensationOwed: boolean;
};

const emptyBreakdown = (): LeavePoolBreakdown => ({
  entitled: 0,
  consumed: 0,
  expired: 0,
  available: 0,
});

function bucketFor(type: LeaveAccrualType): keyof LeavePool["breakdown"] {
  switch (type) {
    case "MONTHLY_UNDER_ONE_YEAR":
      return "monthlyUnderOneYear";
    case "ANNUAL_AFTER_ONE_YEAR":
      return "annualAfterOneYear";
    case "TENURE_BONUS":
      return "tenureBonus";
    case "CARRY_OVER":
      return "carryOver";
    case "MANUAL_ADJUSTMENT":
      return "carryOver";
    default:
      return "carryOver";
  }
}

/**
 * DB LeaveAccrual 행(또는 백필/테스트 입력)으로 잔여·소멸·수당대상 일수를 계산.
 * FIFO 소비는 각 행의 consumedDays에 이미 반영된 것으로 본다.
 */
export function buildLeavePoolFromAccruals(accruals: AccrualInput[], asOf: Date): LeavePool {
  const breakdown: LeavePool["breakdown"] = {
    monthlyUnderOneYear: emptyBreakdown(),
    annualAfterOneYear: emptyBreakdown(),
    tenureBonus: emptyBreakdown(),
    carryOver: emptyBreakdown(),
  };

  let compensationOwedDays = 0;

  for (const row of accruals) {
    const key = bucketFor(row.type);
    const b = breakdown[key];
    const granted = row.days;
    const consumed = Math.min(row.consumedDays, granted);
    const expiredByDate = row.isExpired || isExpiredByAsOf(row.expiresAt, asOf);
    const unconsumed = Math.max(0, granted - consumed);

    b.entitled += granted;
    b.consumed += consumed;

    if (expiredByDate) {
      b.expired += unconsumed;
      if (row.compensationOwed && unconsumed > 0) {
        compensationOwedDays += unconsumed;
      }
    } else {
      b.available += unconsumed;
    }
  }

  let totalEntitled = 0;
  let totalConsumed = 0;
  let totalExpired = 0;
  let available = 0;
  for (const b of Object.values(breakdown)) {
    totalEntitled += b.entitled;
    totalConsumed += b.consumed;
    totalExpired += b.expired;
    available += b.available;
  }

  let nextExpirationDate: Date | null = null;
  for (const row of accruals) {
    const granted = row.days;
    const consumed = Math.min(row.consumedDays, granted);
    const remaining = Math.max(0, granted - consumed);
    if (remaining <= 0.0001) continue;
    if (row.isExpired || isExpiredByAsOf(row.expiresAt, asOf)) continue;
    if (!nextExpirationDate || row.expiresAt.getTime() < nextExpirationDate.getTime()) {
      nextExpirationDate = row.expiresAt;
    }
  }

  return {
    totalEntitled,
    totalConsumed,
    totalExpired,
    available,
    compensationOwedDays,
    breakdown,
    nextAccrualDate: null,
    nextExpirationDate,
  };
}

export function tenureBonusDeltaOnAnniversary(completedYears: number): number {
  if (completedYears < 3) return 0;
  const cur = Math.min(Math.floor((completedYears - 1) / 2), 10);
  const prev = Math.min(Math.floor((completedYears - 2) / 2), 10);
  return Math.max(0, cur - prev);
}

/** 입사일 KST부터 asOf 이후 첫 발생 예정일(월차·입사기념일 순으로 스캔) */
export function computeNextAccrualDate(joinYmd: string, asOf: Date): Date | null {
  const asOfMs = startOfKstDay(asOf).getTime();
  const joinMs = startOfKstDayFromYmd(joinYmd).getTime();
  if (asOfMs < joinMs) return new Date(joinMs);

  for (let m = 1; m <= 11; m++) {
    const ymd = addCalendarMonthsKst(joinYmd, m);
    const t = startOfKstDayFromYmd(ymd).getTime();
    if (t > asOfMs) return new Date(t);
  }
  for (let y = 1; y <= 40; y++) {
    const ymd = addCalendarMonthsKst(joinYmd, 12 * y);
    const t = startOfKstDayFromYmd(ymd).getTime();
    if (t > asOfMs) return new Date(t);
  }
  return null;
}

export function mergePoolWithNextAccrual(pool: LeavePool, joinYmd: string, asOf: Date): LeavePool {
  return { ...pool, nextAccrualDate: computeNextAccrualDate(joinYmd, asOf) };
}
