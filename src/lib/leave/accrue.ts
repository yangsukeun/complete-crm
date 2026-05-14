import prisma from "@/lib/prisma";
import { toKstYmd } from "@/lib/date-kst";
import { isAttendanceRateOk, monthlyAttendanceWindowYmd } from "@/lib/leave/attendance-rate";
import { listLeaveAccrualSlots, type LeaveAccrualSlot } from "@/lib/leave/accrual-schedule";
import { addCalendarDaysKst, addCalendarMonthsKst } from "@/lib/leave/kst-date";
import { loadLeaveLaborConfig } from "@/lib/leave/labor-config";
import { ensureAccrualsUpTo } from "@/lib/leave/ensure-accruals";

export { loadLeaveLaborConfig } from "@/lib/leave/labor-config";
export { ensureAccrualsUpTo } from "@/lib/leave/ensure-accruals";

/** 입사 후 첫 연도(12개월 미만 구간) 전체 출근율 */
async function firstYearAttendanceOk(
  userId: string,
  joinYmd: string,
  threshold: number
): Promise<boolean> {
  const ann12 = addCalendarMonthsKst(joinYmd, 12);
  const endYmd = addCalendarDaysKst(ann12, -1);
  return isAttendanceRateOk(userId, joinYmd, endYmd, threshold);
}

/** y번째 입사기념일 직전 1년 구간 만근(출근율) */
async function yearBeforeAnniversaryOk(
  userId: string,
  joinYmd: string,
  completedYears: number,
  threshold: number
): Promise<boolean> {
  if (completedYears < 1) return false;
  const thisAnnYmd = addCalendarMonthsKst(joinYmd, 12 * completedYears);
  const prevAnnYmd = addCalendarMonthsKst(joinYmd, 12 * (completedYears - 1));
  const startYmd = completedYears === 1 ? joinYmd : prevAnnYmd;
  const endYmd = addCalendarDaysKst(thisAnnYmd, -1);
  return isAttendanceRateOk(userId, startYmd, endYmd, threshold);
}

/** 백필·크론과 동일 출근율 판단 */
export async function leaveAccrualSlotPassesAttendance(
  userId: string,
  joinYmd: string,
  threshold: number,
  slot: LeaveAccrualSlot
): Promise<boolean> {
  if (slot.type === "MONTHLY_UNDER_ONE_YEAR") {
    const m = slot.monthIndex1Based;
    if (!m) return false;
    const win = monthlyAttendanceWindowYmd(joinYmd, m);
    return isAttendanceRateOk(userId, win.startYmd, win.endYmd, threshold);
  }
  if (slot.type === "ANNUAL_AFTER_ONE_YEAR" || slot.type === "TENURE_BONUS") {
    const y = slot.anniversaryYear ?? 0;
    if (y < 1) return false;
    if (y === 1) return firstYearAttendanceOk(userId, joinYmd, threshold);
    return yearBeforeAnniversaryOk(userId, joinYmd, y, threshold);
  }
  return false;
}

/** @deprecated 호환용 — `ensureAccrualsUpTo`와 동일 */
export async function accrueIfDue(userId: string, asOf: Date = new Date()) {
  return ensureAccrualsUpTo(userId, asOf);
}

export async function accrueIfDueAllActiveUsers(asOf: Date = new Date()): Promise<number> {
  const users = await prisma.user.findMany({ select: { id: true } });
  let n = 0;
  for (const u of users) {
    const r = await ensureAccrualsUpTo(u.id, asOf);
    n += r.created;
  }
  return n;
}
