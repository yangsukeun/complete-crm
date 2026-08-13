import { describe, expect, it } from "vitest";
import { currentLeavePeriodYmd } from "@/lib/leave/leave-period";

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
