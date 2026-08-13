import { describe, expect, it } from "vitest";
import {
  getLogisticsDefaultPermissions,
  homePathForUser,
  isCsOrgDepartment,
  isLogisticsOrgDepartment,
  navHrefAllowedForOrg,
  resolveOrgUnit,
} from "@/lib/org-access";

describe("org-access", () => {
  it("maps CS departments to CS home", () => {
    expect(isCsOrgDepartment("CS팀")).toBe(true);
    expect(isCsOrgDepartment("CS")).toBe(true);
    expect(homePathForUser({ role: "USER", department: "CS팀" })).toBe("/cs-tools");
    expect(resolveOrgUnit({ role: "USER", department: "CS팀" })).toBe("CS");
  });

  it("maps 3PL departments to logistics home", () => {
    expect(isLogisticsOrgDepartment("물류")).toBe(true);
    expect(isLogisticsOrgDepartment("3PL")).toBe(true);
    expect(homePathForUser({ role: "USER", department: "물류창고" })).toBe("/logistics");
  });

  it("keeps executives on HQ dashboard", () => {
    expect(resolveOrgUnit({ role: "EXECUTIVE", department: "CS팀" })).toBe("HQ");
    expect(homePathForUser({ role: "ADMIN", department: "물류" })).toBe("/dashboard");
  });

  it("hides HQ-only nav for CS and 3PL staff", () => {
    expect(navHrefAllowedForOrg("/tasks", "CS")).toBe(false);
    expect(navHrefAllowedForOrg("/board", "CS")).toBe(false);
    expect(navHrefAllowedForOrg("/cs-tools", "CS")).toBe(true);
    expect(navHrefAllowedForOrg("/leave", "CS")).toBe(true);
    expect(navHrefAllowedForOrg("/admin/company", "LOGISTICS")).toBe(true);
    expect(navHrefAllowedForOrg("/cs-tools", "LOGISTICS")).toBe(false);
    expect(navHrefAllowedForOrg("/tasks", "HQ")).toBe(true);
  });

  it("gives 3PL default permissions for leave, finance, company info", () => {
    const user = getLogisticsDefaultPermissions("USER");
    expect(user).toEqual(expect.arrayContaining(["leave", "finance_request", "finance_view", "admin_company"]));
    expect(user).not.toContain("tasks");
    expect(user).not.toContain("board");
  });
});
