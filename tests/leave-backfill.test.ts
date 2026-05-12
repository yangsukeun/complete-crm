import { describe, expect, test } from "vitest";
import { generateAccruals } from "@/lib/leave/accrual-schedule";

describe("연차·월차 발생 스케줄 (KST, generateAccruals)", () => {
  test("손예지 케이스 (1년 17일 차)", () => {
    const joinedAt = new Date("2025-04-25T00:00:00+09:00");
    const asOf = new Date("2026-05-12T00:00:00+09:00");
    const accruals = generateAccruals(joinedAt, asOf);

    const monthly = accruals.filter((a) => a.type === "MONTHLY_UNDER_ONE_YEAR");
    expect(monthly.length).toBe(11);
    expect(monthly[0].accruedAt).toEqual(new Date("2025-05-25T00:00:00+09:00"));
    expect(monthly[10].accruedAt).toEqual(new Date("2026-03-25T00:00:00+09:00"));

    const annual = accruals.filter((a) => a.type === "ANNUAL_AFTER_ONE_YEAR");
    expect(annual.length).toBe(1);
    expect(annual[0].days).toBe(15);
    expect(annual[0].accruedAt).toEqual(new Date("2026-04-25T00:00:00+09:00"));
  });

  test("박희준 케이스 (1년 5일 차)", () => {
    const joinedAt = new Date("2025-05-07T00:00:00+09:00");
    const asOf = new Date("2026-05-12T00:00:00+09:00");
    const accruals = generateAccruals(joinedAt, asOf);

    expect(accruals.filter((a) => a.type === "MONTHLY_UNDER_ONE_YEAR").length).toBe(11);
    expect(accruals.filter((a) => a.type === "ANNUAL_AFTER_ONE_YEAR").length).toBe(1);
  });

  test("김정우 케이스 (9개월 12일 차)", () => {
    const joinedAt = new Date("2025-08-01T00:00:00+09:00");
    const asOf = new Date("2026-05-12T00:00:00+09:00");
    const accruals = generateAccruals(joinedAt, asOf);

    expect(accruals.filter((a) => a.type === "MONTHLY_UNDER_ONE_YEAR").length).toBe(9);
    expect(accruals.filter((a) => a.type === "ANNUAL_AFTER_ONE_YEAR").length).toBe(0);
  });

  test("김정신 케이스 (3년 4개월, 근속가산 포함)", () => {
    const joinedAt = new Date("2023-01-03T00:00:00+09:00");
    const asOf = new Date("2026-05-12T00:00:00+09:00");
    const accruals = generateAccruals(joinedAt, asOf);

    expect(accruals.filter((a) => a.type === "ANNUAL_AFTER_ONE_YEAR").length).toBe(3);
    expect(accruals.filter((a) => a.type === "TENURE_BONUS").length).toBe(1);
  });

  test("이하연 케이스 (내일 2년 만근)", () => {
    const joinedAt = new Date("2024-05-13T00:00:00+09:00");
    const asOf = new Date("2026-05-12T00:00:00+09:00");
    const accruals = generateAccruals(joinedAt, asOf);

    expect(accruals.filter((a) => a.type === "ANNUAL_AFTER_ONE_YEAR").length).toBe(1);

    const tomorrow = new Date("2026-05-13T00:00:00+09:00");
    const tomorrowAccruals = generateAccruals(joinedAt, tomorrow);
    expect(tomorrowAccruals.filter((a) => a.type === "ANNUAL_AFTER_ONE_YEAR").length).toBe(2);
  });
});
