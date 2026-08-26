import { describe, expect, it } from "vitest";
import {
  currentLeavePeriodYmd,
  previousLeavePeriodYmd,
  usableAccrualFromYmd,
} from "@/lib/leave/leave-period";

describe("currentLeavePeriodYmd", () => {
  it("uses anniversary window", () => {
    expect(currentLeavePeriodYmd("2024-03-01", "2026-08-13")).toEqual({
      start: "2026-03-01",
      end: "2027-02-28",
    });
  });

  it("uses first year until first anniversary", () => {
    expect(currentLeavePeriodYmd("2026-03-01", "2026-08-13")).toEqual({
      start: "2026-03-01",
      end: "2027-02-28",
    });
  });
});

describe("previousLeavePeriodYmd", () => {
  it("returns prior anniversary window", () => {
    expect(previousLeavePeriodYmd("2024-03-01", "2026-08-13")).toEqual({
      start: "2025-03-01",
      end: "2026-02-28",
    });
  });

  it("returns null in first year", () => {
    expect(previousLeavePeriodYmd("2026-03-01", "2026-08-13")).toBeNull();
  });
});

describe("usableAccrualFromYmd", () => {
  it("uses previous period start when available", () => {
    expect(usableAccrualFromYmd("2024-03-01", "2026-08-13")).toBe("2025-03-01");
  });

  it("uses join date in first year", () => {
    expect(usableAccrualFromYmd("2026-03-01", "2026-08-13")).toBe("2026-03-01");
  });
});
