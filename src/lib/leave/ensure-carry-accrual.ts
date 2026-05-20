import prisma from "@/lib/prisma";
import { getCurrentLeaveCalendarYearKst } from "@/lib/leave";
import { expiresAtFromAccrualYmd, startOfKstDayFromYmd } from "@/lib/leave/kst-date";
import { LEGACY_CARRY_ACCRUAL_YMD } from "@/lib/leave/legacy-carry-sync";

/**
 * LeaveBalance.annualCarryOver → 당해 CARRY_OVER LeaveAccrual (1900 레거시 행과 별도).
 */
export async function ensureBalanceCarryAccrual(userId: string): Promise<void> {
  const year = getCurrentLeaveCalendarYearKst();
  const balance = await prisma.leaveBalance.findUnique({
    where: { userId_year: { userId, year } },
    select: { annualCarryOver: true },
  });
  const carryDays = balance?.annualCarryOver ?? 0;
  if (carryDays <= 1e-6) return;

  const accrualDateYmd = `${year}-01-01`;
  if (accrualDateYmd === LEGACY_CARRY_ACCRUAL_YMD) return;

  const existing = await prisma.leaveAccrual.findUnique({
    where: {
      userId_type_accrualDateYmd: {
        userId,
        type: "CARRY_OVER",
        accrualDateYmd,
      },
    },
    select: { id: true, days: true, consumedDays: true },
  });

  if (!existing) {
    await prisma.leaveAccrual.create({
      data: {
        userId,
        type: "CARRY_OVER",
        days: carryDays,
        accrualDateYmd,
        accruedAt: startOfKstDayFromYmd(accrualDateYmd),
        expiresAt: expiresAtFromAccrualYmd(accrualDateYmd),
        note: `${year - 1}년 이월`,
      },
    });
    return;
  }

  if (existing.days < carryDays - 1e-6 && existing.consumedDays <= 1e-6) {
    await prisma.leaveAccrual.update({
      where: { id: existing.id },
      data: { days: carryDays },
    });
  }
}
