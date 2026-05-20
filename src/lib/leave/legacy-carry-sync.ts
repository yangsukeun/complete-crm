import prisma from "@/lib/prisma";

/** 레거시 동기화용 CARRY_OVER 행 식별자 — 풀 계산에서 제외 */
export const LEGACY_CARRY_ACCRUAL_YMD = "1900-01-01";

function isLegacyCarry(type: string, ymd: string): boolean {
  return type === "CARRY_OVER" && ymd === LEGACY_CARRY_ACCRUAL_YMD;
}

/**
 * 레거시 CARRY_OVER(1900-01-01) 행 정리.
 * - 풀 accrual에 이미 manualDeduction 만큼 반영돼 있으면 행만 삭제(중복 FIFO 방지).
 * - 미반영분만 FIFO로 옮긴 뒤 삭제.
 */
export async function ensureLegacyCarryAccrual(userId: string): Promise<void> {
  const legacy = await prisma.leaveAccrual.findUnique({
    where: {
      userId_type_accrualDateYmd: {
        userId,
        type: "CARRY_OVER",
        accrualDateYmd: LEGACY_CARRY_ACCRUAL_YMD,
      },
    },
    select: { id: true },
  });
  if (!legacy) return;

  const balances = await prisma.leaveBalance.findMany({
    where: { userId },
    select: { manualDeduction: true },
  });
  const priorTotal = balances.reduce((s, b) => s + (b.manualDeduction ?? 0), 0);

  const poolRows = await prisma.leaveAccrual.findMany({
    where: { userId, isExpired: false },
    select: { type: true, accrualDateYmd: true, consumedDays: true },
  });
  const consumedOnPool = poolRows
    .filter((r) => !isLegacyCarry(r.type, r.accrualDateYmd))
    .reduce((s, r) => s + r.consumedDays, 0);

  const toApply = Math.max(0, priorTotal - consumedOnPool);

  await prisma.$transaction(async (tx) => {
    if (toApply > 1e-6) {
      const accruals = await tx.leaveAccrual.findMany({
        where: {
          userId,
          type: { not: "CARRY_OVER" },
          isExpired: false,
        },
        orderBy: [{ accruedAt: "asc" }, { id: "asc" }],
      });

      let left = toApply;
      for (const a of accruals) {
        if (left <= 1e-9) break;
        const room = Math.max(0, a.days - a.consumedDays);
        if (room <= 1e-9) continue;
        const take = Math.min(room, left);
        await tx.leaveAccrual.update({
          where: { id: a.id },
          data: { consumedDays: a.consumedDays + take },
        });
        left -= take;
      }
      if (left > 1e-4) {
        console.warn(`[ensureLegacyCarryAccrual] userId=${userId} 미반영 ${left.toFixed(2)}일`);
      }
    }

    await tx.leaveAccrual.delete({ where: { id: legacy.id } });
  });
}
