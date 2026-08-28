import prisma from "@/lib/prisma";
import { kstYmdToUtcDayStart, toKstYmd } from "@/lib/date-kst";
import { getCurrentLeaveCalendarYearKst } from "@/lib/leave";
import { addCalendarDaysKst, startOfKstDayFromYmd } from "@/lib/leave/kst-date";
import { currentLeavePeriodYmd, previousLeavePeriodYmd } from "@/lib/leave/leave-period";
import { LEGACY_CARRY_ACCRUAL_YMD } from "@/lib/leave/legacy-carry-sync";

/** 이월분은 현재 입사기념 기간이 끝나는 다음날까지 사용 */
export function carryOverExpiresAt(joinYmd: string, asOfYmd: string): Date {
  const current = currentLeavePeriodYmd(joinYmd, asOfYmd);
  return kstYmdToUtcDayStart(addCalendarDaysKst(current.end, 1));
}

/**
 * LeaveBalance.annualCarryOver → CARRY_OVER LeaveAccrual.
 * 발생일은 입사기념일 직전 적용기간 시작일(없으면 당해 1/1).
 * 예전 달력연도(1/1) 행이 있으면 미소진 시 기념일 기준으로 옮긴다.
 */
export async function ensureBalanceCarryAccrual(userId: string): Promise<void> {
  const year = getCurrentLeaveCalendarYearKst();
  const balance = await prisma.leaveBalance.findUnique({
    where: { userId_year: { userId, year } },
    select: { annualCarryOver: true },
  });
  const carryDays = balance?.annualCarryOver ?? 0;
  if (carryDays <= 1e-6) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { joinDate: true },
  });
  const joinYmd = user?.joinDate ? toKstYmd(user.joinDate) : "";
  const asOfYmd = toKstYmd(new Date());
  const prev = joinYmd ? previousLeavePeriodYmd(joinYmd, asOfYmd) : null;
  const preferredYmd = prev?.start ?? `${year}-01-01`;
  const calendarYmd = `${year}-01-01`;
  if (preferredYmd === LEGACY_CARRY_ACCRUAL_YMD) return;

  const expiresAt = joinYmd
    ? carryOverExpiresAt(joinYmd, asOfYmd)
    : kstYmdToUtcDayStart(`${year + 1}-01-01`);

  const note = prev
    ? `직전 적용기간(${prev.start}~${prev.end}) 이월`
    : `${year - 1}년 이월`;

  const findCarry = (accrualDateYmd: string) =>
    prisma.leaveAccrual.findUnique({
      where: {
        userId_type_accrualDateYmd: {
          userId,
          type: "CARRY_OVER",
          accrualDateYmd,
        },
      },
      select: { id: true, days: true, consumedDays: true, accrualDateYmd: true },
    });

  let existing = await findCarry(preferredYmd);

  if (
    !existing &&
    preferredYmd !== calendarYmd
  ) {
    const cal = await findCarry(calendarYmd);
    if (cal && cal.consumedDays <= 1e-6) {
      await prisma.leaveAccrual.delete({ where: { id: cal.id } });
      existing = null;
    } else if (cal) {
      // 이미 일부 사용됨 — 달력 1/1 행을 유지(중복 생성 금지)
      existing = cal;
    }
  }

  if (!existing) {
    await prisma.leaveAccrual.create({
      data: {
        userId,
        type: "CARRY_OVER",
        days: carryDays,
        accrualDateYmd: preferredYmd,
        accruedAt: startOfKstDayFromYmd(preferredYmd),
        expiresAt,
        note,
      },
    });
    return;
  }

  if (existing.days < carryDays - 1e-6 && existing.consumedDays <= 1e-6) {
    await prisma.leaveAccrual.update({
      where: { id: existing.id },
      data: { days: carryDays, note, expiresAt },
    });
    return;
  }
  await prisma.leaveAccrual.update({
    where: { id: existing.id },
    data: { expiresAt, note },
  });
}
