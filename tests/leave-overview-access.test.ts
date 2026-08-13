import { describe, expect, it } from "vitest";
import {
  canAdjustEmployeeLeave,
  canViewEmployeeLeaveSummary,
  leaveSummaryScope,
} from "@/lib/leave-overview-access";

describe("leave-overview-access", () => {
  it("allows HQ and CS team managers only", () => {
    expect(canViewEmployeeLeaveSummary({ role: "ADMIN", department: "경영지원" })).toBe(true);
    expect(canViewEmployeeLeaveSummary({ role: "EXECUTIVE", department: null })).toBe(true);
    expect(canViewEmployeeLeaveSummary({ role: "TEAM_LEAD", department: "CS팀" })).toBe(true);
    expect(canViewEmployeeLeaveSummary({ role: "CENTER_CHIEF", department: "CS팀" })).toBe(true);
    expect(canViewEmployeeLeaveSummary({ role: "USER", department: "CS팀" })).toBe(false);
    expect(canViewEmployeeLeaveSummary({ role: "TEAM_LEAD", department: "마케팅" })).toBe(false);
  });

  it("restricts adjustment to admin/executive", () => {
    expect(canAdjustEmployeeLeave("ADMIN")).toBe(true);
    expect(canAdjustEmployeeLeave("TEAM_LEAD")).toBe(false);
    expect(canAdjustEmployeeLeave("CENTER_CHIEF")).toBe(false);
  });

  it("scopes CS managers to CS only", () => {
    expect(leaveSummaryScope({ role: "ADMIN", department: "경영지원" })).toBe("all");
    expect(leaveSummaryScope({ role: "TEAM_LEAD", department: "CS팀" })).toBe("cs");
    expect(leaveSummaryScope({ role: "USER", department: "CS팀" })).toBe("none");
  });
});
