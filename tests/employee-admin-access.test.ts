import { describe, expect, it } from "vitest";
import {
  canManageEmployeesSync,
  canMutatePrivilegedEmployeeAccount,
  isManagementManagerPosition,
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

  it("restricts privileged-account mutation to executive/admin roles", () => {
    expect(canMutatePrivilegedEmployeeAccount("EXECUTIVE")).toBe(true);
    expect(canMutatePrivilegedEmployeeAccount("ADMIN")).toBe(true);
    expect(canMutatePrivilegedEmployeeAccount("USER")).toBe(false);
  });
});
