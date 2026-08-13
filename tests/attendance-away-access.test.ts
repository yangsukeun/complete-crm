import { describe, expect, it } from "vitest";
import { canUseAwayFeature, canViewAwayOverview } from "@/lib/attendance-away-access";
import { getDefaultPermissionsForRole, hasPermission } from "@/lib/permissions";

describe("canUseAwayFeature", () => {
  it("allows CS / CS팀 by department", () => {
    expect(canUseAwayFeature({ department: "CS팀" })).toBe(true);
    expect(canUseAwayFeature({ department: "CS" })).toBe(true);
    expect(canUseAwayFeature({ department: "마케팅" })).toBe(false);
  });

  it("does not show buttons for HQ admin by role default", () => {
    expect(canUseAwayFeature({ department: "경영지원", permissions: null })).toBe(false);
  });

  it("allows HQ exception only when attendance_away is in custom permissions", () => {
    expect(
      canUseAwayFeature({
        department: "마케팅",
        permissions: JSON.stringify(["dashboard", "attendance_away"]),
      }),
    ).toBe(true);
    expect(
      canUseAwayFeature({
        department: "마케팅",
        permissions: JSON.stringify(["dashboard"]),
      }),
    ).toBe(false);
  });
});

describe("canViewAwayOverview", () => {
  it("allows CS team lead/chief and executives", () => {
    expect(canViewAwayOverview({ role: "TEAM_LEAD", department: "CS팀" })).toBe(true);
    expect(canViewAwayOverview({ role: "CENTER_CHIEF", department: "CS" })).toBe(true);
    expect(canViewAwayOverview({ role: "EXECUTIVE", department: "경영지원" })).toBe(true);
    expect(canViewAwayOverview({ role: "USER", department: "CS팀" })).toBe(false);
    expect(canViewAwayOverview({ role: "TEAM_LEAD", department: "마케팅" })).toBe(false);
  });
});

describe("attendance_import permission defaults", () => {
  it("is on ADMIN/EXECUTIVE defaults and off for USER", () => {
    expect(getDefaultPermissionsForRole("ADMIN")).toContain("attendance_import");
    expect(getDefaultPermissionsForRole("EXECUTIVE")).toContain("attendance_import");
    expect(getDefaultPermissionsForRole("USER")).not.toContain("attendance_import");
    expect(getDefaultPermissionsForRole("TEAM_LEAD")).not.toContain("attendance_import");
    expect(hasPermission("USER", JSON.stringify(["attendance_import", "dashboard"]), "attendance_import")).toBe(
      true,
    );
    expect(hasPermission("USER", JSON.stringify(["dashboard"]), "attendance_import")).toBe(false);
  });
});
