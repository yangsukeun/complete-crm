import { describe, expect, it } from "vitest";
import { crmCallbackPath, crmLandingForUser, isRepresentative, isWorkspaceArea, isCompanyLandingPath, startsCompanyMode } from "../src/lib/crm-login-landing";
import { WORKSPACE_OWNER } from "../src/lib/workspace-areas";
import { workspacePageAreas } from "../src/lib/workspace-page-access";

describe("CRM home", () => {
  it.each([
    ["경영지원팀", "/workspaces/management"],
    ["경영 지원", "/workspaces/management"],
    ["마케팅팀", "/workspaces/marketing"],
    ["CS팀", "/cs-tools"],
    ["cs센터", "/cs-tools"],
    ["물류창고", "/logistics"],
    ["3PL", "/logistics"],
    ["임시 부서", "/workspaces"],
    [null, "/workspaces"],
  ])("routes department %s to %s", (department, expected) => {
    expect(crmLandingForUser({ id: "fixture-employee", department })).toBe(expected);
  });

  it("shows the existing conversation first only for the representative", () => {
    expect(crmLandingForUser({ id: WORKSPACE_OWNER, department: "CS" })).toBe("/rua-project");
    expect(isRepresentative("other-executive")).toBe(false);
    expect(isRepresentative(undefined)).toBe(false);
  });

  it("doesn't choose a department shared as supplementary access", () => {
    const viewer = { id: "fixture-employee", department: "경영지원팀" };
    expect(workspacePageAreas(viewer)).toEqual(["management", "cs", "logistics"]);
    expect(crmLandingForUser(viewer)).toBe("/workspaces/management");
  });

  it("accepts only defined preview paths", () => {
    expect(["management", "marketing", "cs", "logistics"].every(isWorkspaceArea)).toBe(true);
    expect(isWorkspaceArea("toString")).toBe(false);
    expect(isWorkspaceArea("../management")).toBe(false);
  });
});

describe("default login and preserved deep links", () => {
  it.each([undefined, null, "//example.org/elsewhere", "/\\example.org", "https://example.org", "/login", "/login/reset-password", "/%6cogin", "/api/auth/signout", "/signup", "/dashboard?mode=TEAM", "/choose-mode"])("falls back to home for %s", (value) => {
    expect(crmCallbackPath(value)).toBe("/");
  });

  it.each(["/chat?room=fixture", "/dashboard/today-attendance?date=2026-11-20", "/my-project#item", "/cs-tools/leave", "/representative", "/%EC%9E%90%EB%A3%8C?q=https://example.org"])("keeps internal deep link %s", (value) => {
    expect(crmCallbackPath(value)).toBe(value);
  });
});


describe("remembered personal mode", () => {
  it.each(["/workspaces/marketing", "/workspaces/management", "/logistics", "/cs-tools", "/rua-project", "/representative/employee-view/cs"])("uses company menus on %s", path => expect(isCompanyLandingPath(path)).toBe(true));
  it.each(["/my-project", "/personal", "/logistics-other"])("leaves explicit personal or unrelated routes alone: %s", path => expect(isCompanyLandingPath(path)).toBe(false));
});


describe("UI mode initialization", () => {
  it.each(["/", "/chat?room=x", "/rua-project", "/representative", "/my-projects"])("selects company on work login: %s", path => expect(startsCompanyMode(path)).toBe(true));
  it.each(["/my-project", "/my-project/sub?q=x", "/personal"])("does not change mode for explicit personal links: %s", path => expect(startsCompanyMode(path)).toBe(false));
});
