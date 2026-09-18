import { describe, expect, it } from "vitest";
import {
  canCreatePaymentRequest,
  hasFinancePageAccess,
} from "@/lib/permissions";
import { getCsTeamDefaultPermissions } from "@/lib/cs-team-permissions";

const requestOnly = JSON.stringify(["dashboard", "finance_request", "profile"]);
const viewOnly = JSON.stringify(["dashboard", "finance_view", "profile"]);
const neither = JSON.stringify(["dashboard", "profile"]);

describe("finance menu / request access", () => {
  it("경영지원 일반 직원(이체 담당자 아님)도 자금 요청 권한이 있으면 메뉴·신청이 열린다", () => {
    const staff = { role: "USER", permissions: requestOnly };
    expect(hasFinancePageAccess(staff)).toBe(true);
    expect(canCreatePaymentRequest(staff)).toBe(true);
  });

  it("조회만 있으면 메뉴는 열리지만 새 요청은 못한다", () => {
    const viewer = { role: "USER", permissions: viewOnly };
    expect(hasFinancePageAccess(viewer)).toBe(true);
    expect(canCreatePaymentRequest(viewer)).toBe(false);
  });

  it("요청·조회 둘 다 없으면 메뉴가 숨겨진다", () => {
    expect(hasFinancePageAccess({ role: "USER", permissions: neither })).toBe(false);
    expect(canCreatePaymentRequest({ role: "USER", permissions: neither })).toBe(false);
  });

  it("역할 기본값 USER는 이체 담당자가 아니어도 요청할 수 있다", () => {
    const staff = { role: "USER", permissions: null };
    expect(hasFinancePageAccess(staff)).toBe(true);
    expect(canCreatePaymentRequest(staff)).toBe(true);
  });

  it("대표/관리자는 결재만 하고 직접 요청하지 않는다", () => {
    expect(canCreatePaymentRequest({ role: "EXECUTIVE", permissions: null })).toBe(false);
    expect(canCreatePaymentRequest({ role: "ADMIN", permissions: null })).toBe(false);
    expect(hasFinancePageAccess({ role: "EXECUTIVE", permissions: null })).toBe(true);
  });

  it("CS 일반 직원은 조회 화면은 숨기되 요청 메뉴는 연다", () => {
    const perms = getCsTeamDefaultPermissions("USER");
    expect(perms).toContain("finance_request");
    expect(perms).not.toContain("finance_view");
    const json = JSON.stringify(perms);
    expect(hasFinancePageAccess({ role: "USER", permissions: json })).toBe(true);
    expect(canCreatePaymentRequest({ role: "USER", permissions: json })).toBe(true);
  });
});
