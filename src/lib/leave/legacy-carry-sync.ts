import prisma from "@/lib/prisma";

/** 레거시 동기화용 CARRY_OVER 행 식별자 — 풀 계산에서 제외 */
export const LEGACY_CARRY_ACCRUAL_YMD = "1900-01-01";

/**
 * 레거시 LeaveBalance → CARRY_OVER(1900-01-01) 행이 남아 있으면,
 * `manualDeduction` 합만큼 가장 오래된 발생분(FIFO)에 `consumedDays`를 반영한 뒤 행을 삭제합니다.
 * (풀에는 포함하지 않음 — `calculateLeavePool`에서 동일 키는 필터링)
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

  await prisma.$transaction(async (tx) => {
    const accruals = await tx.leaveAccrual.findMany({
      where: {
        userId,
        type: { not: "CARRY_OVER" },
        isExpired: false,
      },
      orderBy: [{ accruedAt: "asc" }, { id: "asc" }],
    });

    let left = priorTotal;
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

    await tx.leaveAccrual.delete({ where: { id: legacy.id } });
  });
}
