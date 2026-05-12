import type { LeaveAccrual } from "@prisma/client";
import prisma from "@/lib/prisma";
import { toKstYmd } from "@/lib/date-kst";
import { isAttendanceRateOk, monthlyAttendanceWindowYmd } from "@/lib/leave/attendance-rate";
import {
  addCalendarDaysKst,
  addCalendarMonthsKst,
  expiresAtFromAccrualYmd,
  startOfKstDay,
  startOfKstDayFromYmd,
} from "@/lib/leave/kst-date";
import { tenureBonusDeltaOnAnniversary } from "@/lib/leave/pure-pool";

async function loadLaborConfig() {
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

/**
 * 입사일 기준 asOf까지 도래한 발생분을 idempotent 생성.
 */
export async function accrueIfDue(userId: string, asOf: Date = new Date()): Promise<LeaveAccrual[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { joinDate: true },
  });
  if (!user?.joinDate) return [];

  const joinYmd = toKstYmd(user.joinDate);
  if (!joinYmd) return [];

  const asOfYmd = toKstYmd(asOf);
  const asOfStart = startOfKstDay(asOf).getTime();
  const { threshold, annualDays, monthlyCap } = await loadLaborConfig();

  const created: LeaveAccrual[] = [];

  // 1..11 월차
  for (let m = 1; m <= monthlyCap; m++) {
    const accYmd = addCalendarMonthsKst(joinYmd, m);
    if (startOfKstDayFromYmd(accYmd).getTime() > asOfStart) break;
    const win = monthlyAttendanceWindowYmd(joinYmd, m);
    const ok = await isAttendanceRateOk(userId, win.startYmd, win.endYmd, threshold);
    if (!ok) continue;
    const row = await upsertAccrual(userId, "MONTHLY_UNDER_ONE_YEAR", accYmd, 1, `§60② ${m}개월차`);
    if (row) created.push(row);
  }

  // 1주년 정규 연차
  const ann1Ymd = addCalendarMonthsKst(joinYmd, 12);
  if (startOfKstDayFromYmd(ann1Ymd).getTime() <= asOfStart) {
    const ok = await firstYearAttendanceOk(userId, joinYmd, threshold);
    if (ok) {
      const row = await upsertAccrual(userId, "ANNUAL_AFTER_ONE_YEAR", ann1Ymd, annualDays, "§60① 1주년");
      if (row) created.push(row);
    }
  }

  // 2주년 이후 매 기념일
  for (let y = 2; y <= 50; y++) {
    const annYmd = addCalendarMonthsKst(joinYmd, 12 * y);
    if (startOfKstDayFromYmd(annYmd).getTime() > asOfStart) break;
    const ok = await yearBeforeAnniversaryOk(userId, joinYmd, y, threshold);
    if (!ok) continue;
    const rowA = await upsertAccrual(userId, "ANNUAL_AFTER_ONE_YEAR", annYmd, annualDays, `§60① ${y}주년`);
    if (rowA) created.push(rowA);
    const bonus = tenureBonusDeltaOnAnniversary(y);
    if (bonus > 0) {
      const rowB = await upsertAccrual(userId, "TENURE_BONUS", annYmd, bonus, `§60④ ${y}주년 가산`);
      if (rowB) created.push(rowB);
    }
  }

  return created;
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
