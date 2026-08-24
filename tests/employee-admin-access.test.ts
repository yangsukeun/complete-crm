import { describe, expect, it } from "vitest";
import {
  canManageEmployeesSync,
  canMutatePrivilegedEmployeeAccount,
  isEmployeeManageDelegate,
  isManagementManagerPosition,
  resolveEmployeeManagerKind,
} from "@/lib/employee-admin-access";

describe("employee-admin-access", () => {
  it("recognizes 경영관리 매니저 position", () => {
    expect(isManagementManagerPosition("경영관리 매니저")).toBe(true);
    expect(isManagementManagerPosition(" 경영관리 매니저 ")).toBe(true);
    expect(isManagementManagerPosition("CS")).toBe(false);
  });

  it("lets executive, admin, and 경영관리 매니저 manage employees", () => {
    expect(canManageEmployeesSync({ role: "EXECUTIVE", position: null })).toBe(true);
    expect(canManageEmployeesSync({ role: "ADMIN", position: null })).toBe(true);
    expect(canManageEmployeesSync({ role: "USER", position: "경영관리 매니저" })).toBe(true);
    expect(canManageEmployeesSync({ role: "USER", position: "AD" })).toBe(false);
    expect(canManageEmployeesSync({ role: "TEAM_LEAD", position: "팀장" })).toBe(false);
  });

  it("grants access via employee_manage permission", () => {
    const perms = JSON.stringify(["dashboard", "employee_manage", "profile"]);
    expect(
      canManageEmployeesSync({
        role: "USER",
        position: "AD",
        permissionsJson: perms,
      })
    ).toBe(true);
    expect(
      resolveEmployeeManagerKind({
        role: "USER",
        position: "AD",
        permissionsJson: perms,
      })
    ).toBe("employee_manage");
    expect(isEmployeeManageDelegate("employee_manage")).toBe(true);
  });

  it("does not grant employee_manage when permission absent", () => {
    expect(
      resolveEmployeeManagerKind({
        role: "USER",
        position: null,
        permissionsJson: JSON.stringify(["dashboard", "finance_view"]),
      })
    ).toBe("none");
  });

  it("restricts privileged-account mutation to executive/admin roles", () => {
    expect(canMutatePrivilegedEmployeeAccount("EXECUTIVE")).toBe(true);
    expect(canMutatePrivilegedEmployeeAccount("ADMIN")).toBe(true);
    expect(canMutatePrivilegedEmployeeAccount("USER")).toBe(false);
  });

  it("keeps finance_view in FEATURE_LABELS", async () => {
    const { FEATURE_LABELS, FEATURE_KEYS } = await import("@/lib/permissions");
    expect(FEATURE_LABELS.finance_view).toBe("자금 조회");
    expect(FEATURE_KEYS).toContain("finance_view");
    expect(FEATURE_KEYS).toContain("employee_manage");
    expect(FEATURE_LABELS.employee_manage).toContain("employee_manage");
  });
});
