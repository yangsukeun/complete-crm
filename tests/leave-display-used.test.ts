import { describe, expect, it } from "vitest";
import {
  leaveDisplayUsedDays,
  shouldFifoPriorUsageOntoCurrentPool,
} from "@/lib/leave/display-used";
import { carryOverExpiresAt } from "@/lib/leave/ensure-carry-accrual";
import { toKstYmd } from "@/lib/date-kst";

describe("leaveDisplayUsedDays", () => {
  it("is grant + carry minus remaining", () => {
    expect(leaveDisplayUsedDays(21, 16.75)).toBeCloseTo(4.25, 5);
  });

  it("does not go negative", () => {
    expect(leaveDisplayUsedDays(10, 12)).toBe(0);
  });
});

describe("shouldFifoPriorUsageOntoCurrentPool", () => {
  it("applies CRM-prior usage only when there is no carryover leftover", () => {
    expect(
      shouldFifoPriorUsageOntoCurrentPool({ manualDeduction: 5, annualCarryOver: 0 })
    ).toBe(true);
  });

  it("does not re-deduct prior usage when carryover is already net remaining", () => {
    expect(
      shouldFifoPriorUsageOntoCurrentPool({ manualDeduction: 3.5, annualCarryOver: 5 })
    ).toBe(false);
  });
});

describe("carryOverExpiresAt", () => {
  it("lasts until the day after the current anniversary period ends", () => {
    expect(toKstYmd(carryOverExpiresAt("2023-01-03", "2026-08-28"))).toBe("2027-01-03");
  });
});
