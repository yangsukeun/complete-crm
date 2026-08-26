import { describe, expect, it } from "vitest";
import { computePeriodDisplayGranted } from "@/lib/leave/period-granted";

describe("computePeriodDisplayGranted", () => {
  const asOf = new Date("2026-08-26T03:00:00.000Z");
  const period = { start: "2025-07-06", end: "2026-07-05" };

  it("sums current period + valid carry, excludes expired lifetime", () => {
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
          accrualDateYmd: "2025-07-01",
          expiresAt: new Date("2026-12-31T15:00:00.000Z"),
          isExpired: false,
        },
      ],
      period,
      asOf
    );
    // 2025-07-06 in period → 15; CARRY 2025-07-01은 기간 밖·미만료 → validCarry 2
    expect(r.periodGranted).toBe(15);
    expect(r.validCarry).toBe(2);
    expect(r.displayGranted).toBe(17);
    expect(r.excludedExpired).toBe(30);
  });

  it("counts unexpired out-of-period as valid carry", () => {
    const r = computePeriodDisplayGranted(
      [
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
      asOf
    );
    expect(r.periodGranted).toBe(15);
    expect(r.validCarry).toBe(15);
    expect(r.displayGranted).toBe(30);
  });
});
