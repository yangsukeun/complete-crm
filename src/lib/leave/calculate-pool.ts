import prisma from "@/lib/prisma";
import { toKstYmd } from "@/lib/date-kst";
import { ensureAccrualsUpTo } from "@/lib/leave/accrue";
import { ensureApprovedLeavesConsumedUpTo } from "@/lib/leave/ensure-approved-consumption";
import { ensureLegacyCarryAccrual, LEGACY_CARRY_ACCRUAL_YMD } from "@/lib/leave/legacy-carry-sync";
import {
  buildLeavePoolFromAccruals,
  mergePoolWithNextAccrual,
  type AccrualInput,
  type LeavePool,
} from "@/lib/leave/pure-pool";

export type { LeavePool, LeavePoolBreakdown } from "@/lib/leave/pure-pool";

export type AccrualLineSnapshot = {
  accrualDateYmd: string;
  days: number;
  consumedDays: number;
  isExpired: boolean;
};

export type AccrualLinesByBucket = {
  monthlyUnderOneYear: AccrualLineSnapshot[];
  annualAfterOneYear: AccrualLineSnapshot[];
  tenureBonus: AccrualLineSnapshot[];
};

export type CalculatedLeavePool = LeavePool & {
  /** 표시용: 풀에 포함된 LeaveAccrual만의 consumedDays 합 */
  totalConsumedDaysFromAccruals: number;
  /** LeaveBalance.manualDeduction 합 (CRM 도입 전 사용 — 표시 전용, 풀 합산 제외) */
  priorCrmUsageDays: number;
  /** LeaveBalance.annualCarryOver 합 (참고·호버용, 레거시 CARRY 행과 별도) */
  annualCarryOverDaysReported: number;
  /** 총발생 ≈ 사용 + 만료 + 잔여 (근사) */
  poolMathConsistent: boolean;
  accrualLines: AccrualLinesByBucket;
};

function isLegacyCarryRow(type: string, accrualDateYmd: string): boolean {
  return type === "CARRY_OVER" && accrualDateYmd === LEGACY_CARRY_ACCRUAL_YMD;
}

function groupAccrualLines(
  rows: Array<{
    type: string;
    accrualDateYmd: string;
    days: number;
    consumedDays: number;
    isExpired: boolean;
  }>
): AccrualLinesByBucket {
  const monthlyUnderOneYear: AccrualLineSnapshot[] = [];
  const annualAfterOneYear: AccrualLineSnapshot[] = [];
  const tenureBonus: AccrualLineSnapshot[] = [];
  for (const r of rows) {
    const snap: AccrualLineSnapshot = {
      accrualDateYmd: r.accrualDateYmd,
      days: r.days,
      consumedDays: r.consumedDays,
      isExpired: r.isExpired,
    };
    if (r.type === "MONTHLY_UNDER_ONE_YEAR") monthlyUnderOneYear.push(snap);
    else if (r.type === "ANNUAL_AFTER_ONE_YEAR") annualAfterOneYear.push(snap);
    else if (r.type === "TENURE_BONUS") tenureBonus.push(snap);
  }
  const ycmp = (a: AccrualLineSnapshot, b: AccrualLineSnapshot) => a.accrualDateYmd.localeCompare(b.accrualDateYmd);
  monthlyUnderOneYear.sort(ycmp);
  annualAfterOneYear.sort(ycmp);
  tenureBonus.sort(ycmp);
  return { monthlyUnderOneYear, annualAfterOneYear, tenureBonus };
}

/**
 * LeaveAccrual + 레거시 LeaveBalance(읽기) 기반 연차 풀.
 * 레거시 `CARRY_OVER`(1900-01-01) 행은 풀·산수에서 제외합니다.
 */
export async function calculateLeavePool(
  userId: string,
  asOf: Date = new Date(),
  options?: { skipAccrue?: boolean }
): Promise<CalculatedLeavePool> {
  if (!options?.skipAccrue) {
    await ensureAccrualsUpTo(userId, asOf);
  }
  await ensureLegacyCarryAccrual(userId);
  if (!options?.skipAccrue) {
    await ensureApprovedLeavesConsumedUpTo(userId, asOf);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { joinDate: true },
  });
  const joinYmd = user?.joinDate ? toKstYmd(user.joinDate) : "";

  const balances = await prisma.leaveBalance.findMany({
    where: { userId },
    select: { manualDeduction: true, annualCarryOver: true },
  });
  const priorCrmUsageDays = balances.reduce((s, b) => s + (b.manualDeduction ?? 0), 0);
  const annualCarryOverDaysReported = balances.reduce((s, b) => s + (b.annualCarryOver ?? 0), 0);

  const rows = await prisma.leaveAccrual.findMany({
    where: { userId },
    orderBy: [{ accruedAt: "asc" }, { id: "asc" }],
  });

  const poolRows = rows.filter((r) => !isLegacyCarryRow(r.type, r.accrualDateYmd));
  const totalConsumedDaysFromAccruals = poolRows.reduce((s, r) => s + r.consumedDays, 0);

  const inputs: AccrualInput[] = poolRows.map((r) => ({
    type: r.type,
    days: r.days,
    consumedDays: r.consumedDays,
    accruedAt: r.accruedAt,
    expiresAt: r.expiresAt,
    isExpired: r.isExpired,
    compensationOwed: r.compensationOwed,
  }));

  const pool = buildLeavePoolFromAccruals(inputs, asOf);
  const merged = joinYmd ? mergePoolWithNextAccrual(pool, joinYmd, asOf) : pool;

  const sumParts = merged.totalConsumed + merged.totalExpired + merged.available;
  const poolMathConsistent = Math.abs(merged.totalEntitled - sumParts) < 1e-4;
  const accrualLines = groupAccrualLines(poolRows);

  return {
    ...merged,
    /** 표시 사용계 = LeaveAccrual.consumedDays 합만 (이전 사용분·승인 이중 합산 금지) */
    totalConsumed: totalConsumedDaysFromAccruals,
    totalConsumedDaysFromAccruals,
    priorCrmUsageDays,
    annualCarryOverDaysReported,
    poolMathConsistent,
    accrualLines,
  };
}

export async function getLeaveAvailableDays(userId: string, asOf?: Date): Promise<number> {
  const p = await calculateLeavePool(userId, asOf ?? new Date());
  return p.available;
}
