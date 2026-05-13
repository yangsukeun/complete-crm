import type { LeaveAccrual } from "@prisma/client";
import prisma from "@/lib/prisma";
import { toKstYmd } from "@/lib/date-kst";
import { isAttendanceRateOk, monthlyAttendanceWindowYmd } from "@/lib/leave/attendance-rate";
import { listLeaveAccrualSlots, type LeaveAccrualSlot } from "@/lib/leave/accrual-schedule";
import {
  addCalendarDaysKst,
  addCalendarMonthsKst,
  expiresAtFromAccrualYmd,
  startOfKstDayFromYmd,
} from "@/lib/leave/kst-date";

export async function loadLeaveLaborConfig() {
  const row = await prisma.companyInfo.findFirst({
    orderBy: { updatedAt: "desc" },
    select: {
      attendanceThreshold: true,
      annualLeaveDaysAfterFirstFullYear: true,
      annualLeaveMonthlyMaxUnderOneYear: true,
    },
  });
  const threshold =
    typeof row?.attendanceThreshold === "number" && Number.isFinite(row.attendanceThreshold)
      ? row.attendanceThreshold
      : 0.8;
  const annualDays =
    typeof row?.annualLeaveDaysAfterFirstFullYear === "number" && Number.isFinite(row.annualLeaveDaysAfterFirstFullYear)
      ? row.annualLeaveDaysAfterFirstFullYear
      : 15;
  const monthlyCap =
    typeof row?.annualLeaveMonthlyMaxUnderOneYear === "number" && Number.isFinite(row.annualLeaveMonthlyMaxUnderOneYear)
      ? row.annualLeaveMonthlyMaxUnderOneYear
      : 11;
  return { threshold, annualDays, monthlyCap };
}

async function upsertAccrual(
  userId: string,
  type: "MONTHLY_UNDER_ONE_YEAR" | "ANNUAL_AFTER_ONE_YEAR" | "TENURE_BONUS" | "CARRY_OVER",
  accrualDateYmd: string,
  days: number,
  note?: string
): Promise<LeaveAccrual | null> {
  const accruedAt = startOfKstDayFromYmd(accrualDateYmd);
  const expiresAt = expiresAtFromAccrualYmd(accrualDateYmd);
  try {
    return await prisma.leaveAccrual.upsert({
      where: { userId_type_accrualDateYmd: { userId, type, accrualDateYmd } },
      create: { userId, type, days, accrualDateYmd, accruedAt, expiresAt, note: note ?? null },
      update: { updatedAt: new Date() },
    });
  } catch {
    return null;
  }
}

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

/**
 * 입사일 기준 asOf까지 도래한 발생분을 idempotent 생성.
 * 출근율은 발생 생성에 쓰지 않음(스케줄만 반영). 출근율 판정은 `leaveAccrualSlotPassesAttendance` 참고.
 */
export async function ensureAccrualsUpTo(userId: string, asOf: Date = new Date()): Promise<LeaveAccrual[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { joinDate: true },
  });
  if (!user?.joinDate) return [];

  const joinYmd = toKstYmd(user.joinDate);
  if (!joinYmd) return [];

  const { annualDays, monthlyCap } = await loadLeaveLaborConfig();
  const slots = listLeaveAccrualSlots(user.joinDate, asOf, { monthlyCap, annualDays });

  const created: LeaveAccrual[] = [];
  for (const slot of slots) {
    const row = await upsertAccrual(userId, slot.type, slot.accrualDateYmd, slot.days, slot.note);
    if (row) created.push(row);
  }
  return created;
}

/** @deprecated 호환용 — `ensureAccrualsUpTo`와 동일 */
export async function accrueIfDue(userId: string, asOf: Date = new Date()): Promise<LeaveAccrual[]> {
  return ensureAccrualsUpTo(userId, asOf);
}

export async function accrueIfDueAllActiveUsers(asOf: Date = new Date()): Promise<number> {
  const users = await prisma.user.findMany({ select: { id: true } });
  let n = 0;
  for (const u of users) {
    const rows = await accrueIfDue(u.id, asOf);
    n += rows.length;
  }
  return n;
}
