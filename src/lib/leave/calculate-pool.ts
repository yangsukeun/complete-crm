import prisma from "@/lib/prisma";
import { toKstYmd } from "@/lib/date-kst";
import { accrueIfDue } from "@/lib/leave/accrue";
import { ensureLegacyCarryAccrual } from "@/lib/leave/legacy-carry-sync";
import {
  buildLeavePoolFromAccruals,
  mergePoolWithNextAccrual,
  type AccrualInput,
  type LeavePool,
} from "@/lib/leave/pure-pool";

export type { LeavePool, LeavePoolBreakdown } from "@/lib/leave/pure-pool";

/**
 * LeaveAccrual + 레거시 LeaveBalance(읽기) 기반 연차 풀.
 * @param options.skipAccrue true면 발생 생성 생략(순수 조회·테스트용)
 */
export async function calculateLeavePool(
  userId: string,
  asOf: Date = new Date(),
  options?: { skipAccrue?: boolean }
): Promise<LeavePool> {
  if (!options?.skipAccrue) {
    await accrueIfDue(userId, asOf);
  }
  await ensureLegacyCarryAccrual(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { joinDate: true },
  });
  const joinYmd = user?.joinDate ? toKstYmd(user.joinDate) : "";

  const rows = await prisma.leaveAccrual.findMany({
    where: { userId },
    orderBy: { accruedAt: "asc" },
  });

  const balances = await prisma.leaveBalance.findMany({
    where: { userId },
    select: { annualUsed: true },
  });
  const legacyUsed = balances.reduce((s, b) => s + (b.annualUsed ?? 0), 0);
  const totalAccrualConsumed = rows.reduce((s, r) => s + r.consumedDays, 0);

  const inputs: AccrualInput[] = rows.map((r) => ({
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

  const extraLegacyUsed = Math.max(0, legacyUsed - totalAccrualConsumed);
  if (extraLegacyUsed > 0.00001) {
    return {
      ...merged,
      available: Math.max(0, merged.available - extraLegacyUsed),
    };
  }

  return merged;
}

export async function getLeaveAvailableDays(userId: string, asOf?: Date): Promise<number> {
  const p = await calculateLeavePool(userId, asOf ?? new Date());
  return p.available;
}
