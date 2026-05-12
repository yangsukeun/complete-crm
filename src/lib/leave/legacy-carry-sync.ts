import prisma from "@/lib/prisma";
import { startOfKstDayFromYmd } from "@/lib/leave/kst-date";

const LEGACY_CARRY_YMD = "1900-01-01";

/**
 * LeaveBalance 이월·실사용차감을 DB LeaveAccrual(CARRY_OVER) 1행으로 반영(생성 또는 갱신).
 * FIFO 차감이 실제 accrual id를 갖도록 한다.
 */
export async function ensureLegacyCarryAccrual(userId: string): Promise<void> {
  const balances = await prisma.leaveBalance.findMany({
    where: { userId },
    select: { annualCarryOver: true, manualDeduction: true },
  });
  const legacyCarry = balances.reduce((s, b) => s + (b.annualCarryOver ?? 0), 0);
  const legacyManual = balances.reduce((s, b) => s + (b.manualDeduction ?? 0), 0);

  const existing = await prisma.leaveAccrual.findUnique({
    where: { userId_type_accrualDateYmd: { userId, type: "CARRY_OVER", accrualDateYmd: LEGACY_CARRY_YMD } },
  });

  const days = legacyCarry + legacyManual;
  if (days <= 0) {
    if (existing) {
      await prisma.leaveAccrual.delete({ where: { id: existing.id } });
    }
    return;
  }

  const accruedAt = startOfKstDayFromYmd(LEGACY_CARRY_YMD);
  const expiresAt = new Date("2099-12-31T00:00:00+09:00");

  if (existing) {
    await prisma.leaveAccrual.update({
      where: { id: existing.id },
      data: {
        days,
        consumedDays: legacyManual,
      },
    });
    return;
  }

  await prisma.leaveAccrual.create({
    data: {
      userId,
      type: "CARRY_OVER",
      days,
      accrualDateYmd: LEGACY_CARRY_YMD,
      accruedAt,
      expiresAt,
      consumedDays: legacyManual,
      note: "레거시 LeaveBalance 이월+실사용차감",
    },
  });
}
