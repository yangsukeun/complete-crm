import { describe, expect, it } from "vitest";
import { computePeriodDisplayGranted } from "@/lib/leave/period-granted";

describe("computePeriodDisplayGranted", () => {
  const asOf = new Date("2026-08-26T03:00:00.000Z");
  const period = { start: "2025-07-06", end: "2026-07-05" };
  const previous = { start: "2024-07-06", end: "2025-07-05" };

  it("sums current period + previous-period carry only", () => {
    const r = computePeriodDisplayGranted(
      [
        {
          type: "ANNUAL_AFTER_ONE_YEAR",
          days: 15,
          accrualDateYmd: "2023-07-06",
          expiresAt: new Date("2024-07-05T15:00:00.000Z"),
          isExpired: true,
        },
        {
          type: "ANNUAL_AFTER_ONE_YEAR",
          days: 15,
          accrualDateYmd: "2024-07-06",
          expiresAt: new Date("2025-07-05T15:00:00.000Z"),
          isExpired: false, // date-expired
        },
        {
          type: "ANNUAL_AFTER_ONE_YEAR",
          days: 15,
          accrualDateYmd: "2025-07-06",
          expiresAt: new Date("2026-07-05T15:00:00.000Z"),
          isExpired: false,
        },
        {
          type: "CARRY_OVER",
          days: 2,
          accrualDateYmd: "2024-08-01",
          expiresAt: new Date("2026-12-31T15:00:00.000Z"),
          isExpired: false,
        },
      ],
      period,
      asOf,
      previous
    );
    // 2025-07-06 in period → 15; CARRY 2024-08-01 in previous → validCarry 2
    expect(r.periodGranted).toBe(15);
    expect(r.validCarry).toBe(2);
    expect(r.displayGranted).toBe(17);
    expect(r.excludedExpired).toBe(30);
    expect(r.excludedStaleCarry).toBe(0);
  });

  it("excludes unexpired accruals older than previous period", () => {
    const r = computePeriodDisplayGranted(
      [
        {
          type: "ANNUAL_AFTER_ONE_YEAR",
          days: 15,
          accrualDateYmd: "2023-07-06",
          expiresAt: new Date("2027-07-05T15:00:00.000Z"),
          isExpired: false,
        },
        {
          type: "ANNUAL_AFTER_ONE_YEAR",
          days: 15,
          accrualDateYmd: "2024-07-06",
          expiresAt: new Date("2027-07-05T15:00:00.000Z"),
          isExpired: false,
        },
        {
          type: "ANNUAL_AFTER_ONE_YEAR",
          days: 15,
          accrualDateYmd: "2025-07-06",
          expiresAt: new Date("2026-07-05T15:00:00.000Z"),
          isExpired: false,
        },
      ],
      period,
      asOf,
      previous
    );
    expect(r.periodGranted).toBe(15);
    expect(r.validCarry).toBe(15);
    expect(r.displayGranted).toBe(30);
    expect(r.excludedStaleCarry).toBe(15);
  });

  it("has no carry in first anniversary year", () => {
    const firstPeriod = { start: "2026-03-01", end: "2027-02-28" };
    const r = computePeriodDisplayGranted(
      [
        {
          type: "MONTHLY_UNDER_ONE_YEAR",
          days: 1,
          accrualDateYmd: "2026-04-01",
          expiresAt: new Date("2027-03-31T15:00:00.000Z"),
          isExpired: false,
        },
        {
          type: "ANNUAL_AFTER_ONE_YEAR",
          days: 5,
          accrualDateYmd: "2025-01-01",
          expiresAt: new Date("2027-01-01T15:00:00.000Z"),
          isExpired: false,
        },
      ],
      firstPeriod,
      asOf,
      null
    );
    expect(r.periodGranted).toBe(1);
    expect(r.validCarry).toBe(0);
    expect(r.excludedStaleCarry).toBe(5);
  });
});
