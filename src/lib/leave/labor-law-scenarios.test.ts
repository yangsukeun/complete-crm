import { describe, expect, it } from "vitest";
import type { LeaveAccrualType } from "@prisma/client";
import { toKstYmd } from "@/lib/date-kst";
import {
  buildLeavePoolFromAccruals,
  mergePoolWithNextAccrual,
  type AccrualInput,
} from "@/lib/leave/pure-pool";
import { addCalendarMonthsKst, expiresAtFromAccrualYmd, startOfKstDayFromYmd } from "@/lib/leave/kst-date";

const AS_OF = new Date("2026-05-12T12:00:00+09:00");

function acc(
  type: LeaveAccrualType,
  accrualYmd: string,
  days: number,
  consumed: number,
  opts?: { isExpired?: boolean; compensationOwed?: boolean; expiresAt?: Date }
): AccrualInput {
  return {
    type,
    days,
    consumedDays: consumed,
    accruedAt: startOfKstDayFromYmd(accrualYmd),
    expiresAt: opts?.expiresAt ?? expiresAtFromAccrualYmd(accrualYmd),
    isExpired: opts?.isExpired ?? false,
    compensationOwed: opts?.compensationOwed ?? false,
  };
}

describe("근기법 연차 풀 시나리오 (고정 asOf=2026-05-12)", () => {
  it("GoPro 2026-01-07 · 4개월 월차 4일 중 1일 사용 → 잔여 3", () => {
    const join = "2026-01-07";
    const rows: AccrualInput[] = [];
    for (let m = 1; m <= 4; m++) {
      const ymd = addCalendarMonthsKst(join, m);
      rows.push(acc("MONTHLY_UNDER_ONE_YEAR", ymd, 1, m === 1 ? 1 : 0));
    }
    const pool = buildLeavePoolFromAccruals(rows, AS_OF);
    expect(pool.available).toBeCloseTo(3, 5);
  });

  it("김소윤 2024-12-26 · 월차 11 + 정규 15, FIFO로 4일 사용 → 22", () => {
    const join = "2024-12-26";
    const rows: AccrualInput[] = [];
    for (let m = 1; m <= 11; m++) {
      const ymd = addCalendarMonthsKst(join, m);
      rows.push(acc("MONTHLY_UNDER_ONE_YEAR", ymd, 1, m <= 4 ? 1 : 0));
    }
    rows.push(acc("ANNUAL_AFTER_ONE_YEAR", addCalendarMonthsKst(join, 12), 15, 0));
    const pool = buildLeavePoolFromAccruals(rows, AS_OF);
    expect(pool.available).toBeCloseTo(22, 5);
  });

  it("김정신 2023-01-03 · 정규15+가산1+이월5, 사용5 → 16", () => {
    const far = new Date("2099-12-31T00:00:00+09:00");
    const rows: AccrualInput[] = [
      acc("CARRY_OVER", "1900-01-01", 5, 5, { expiresAt: far }),
      acc("ANNUAL_AFTER_ONE_YEAR", "2024-01-03", 15, 0, { expiresAt: far }),
      acc("TENURE_BONUS", "2026-01-03", 1, 0, { expiresAt: far }),
    ];
    const pool = buildLeavePoolFromAccruals(rows, AS_OF);
    expect(pool.available).toBeCloseTo(16, 5);
  });

  it("김정우 2025-08-01 · 9개월 월차, 6일 사용 → 3", () => {
    const join = "2025-08-01";
    const rows: AccrualInput[] = [];
    for (let m = 1; m <= 9; m++) {
      const ymd = addCalendarMonthsKst(join, m);
      const c = m <= 6 ? 1 : 0;
      rows.push(acc("MONTHLY_UNDER_ONE_YEAR", ymd, 1, c));
    }
    const pool = buildLeavePoolFromAccruals(rows, AS_OF);
    expect(pool.available).toBeCloseTo(3, 5);
  });

  it("류성현 2024-07-02 · 월차 11 소멸(수당), 정규 15 중 1 사용 → 잔여 14·수당 11", () => {
    const join = "2024-07-02";
    const rows: AccrualInput[] = [];
    for (let m = 1; m <= 11; m++) {
      const ymd = addCalendarMonthsKst(join, m);
      rows.push(
        acc("MONTHLY_UNDER_ONE_YEAR", ymd, 1, 0, {
          isExpired: true,
          compensationOwed: true,
        })
      );
    }
    rows.push(acc("ANNUAL_AFTER_ONE_YEAR", addCalendarMonthsKst(join, 12), 15, 1));
    const pool = buildLeavePoolFromAccruals(rows, AS_OF);
    expect(pool.available).toBeCloseTo(14, 5);
    expect(pool.compensationOwedDays).toBeCloseTo(11, 5);
  });

  it("손예지 2025-04-25 · 월차 8일분 사용 + 정규 4일 사용 → 14", () => {
    const join = "2025-04-25";
    const rows: AccrualInput[] = [];
    for (let m = 1; m <= 11; m++) {
      const ymd = addCalendarMonthsKst(join, m);
      rows.push(acc("MONTHLY_UNDER_ONE_YEAR", ymd, 1, m <= 8 ? 1 : 0));
    }
    rows.push(acc("ANNUAL_AFTER_ONE_YEAR", addCalendarMonthsKst(join, 12), 15, 4));
    const pool = buildLeavePoolFromAccruals(rows, AS_OF);
    expect(pool.available).toBeCloseTo(14, 5);
  });

  it("이하연 2024-05-13 · 정규 15 전부 사용 → 잔여 0, 다음 발생은 2026-05-13", () => {
    const join = "2024-05-13";
    const rows: AccrualInput[] = [acc("ANNUAL_AFTER_ONE_YEAR", addCalendarMonthsKst(join, 12), 15, 15)];
    const pool = mergePoolWithNextAccrual(buildLeavePoolFromAccruals(rows, AS_OF), join, AS_OF);
    expect(pool.available).toBeCloseTo(0, 5);
    expect(pool.nextAccrualDate).not.toBeNull();
    expect(toKstYmd(pool.nextAccrualDate!)).toBe("2026-05-13");
  });

  it("이하연 · 2026-05-13 이후에는 +15 반영", () => {
    const join = "2024-05-13";
    const rows: AccrualInput[] = [
      acc("ANNUAL_AFTER_ONE_YEAR", addCalendarMonthsKst(join, 12), 15, 15),
      acc("ANNUAL_AFTER_ONE_YEAR", addCalendarMonthsKst(join, 24), 15, 0),
    ];
    const asNext = new Date("2026-05-13T12:00:00+09:00");
    const pool = buildLeavePoolFromAccruals(rows, asNext);
    expect(pool.available).toBeCloseTo(15, 5);
  });
});
