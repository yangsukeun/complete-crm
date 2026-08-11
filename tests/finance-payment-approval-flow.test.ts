import { describe, expect, it } from "vitest";
import {
  canCenterChiefApprovePaymentRequest,
  canTeamLeadApprovePaymentRequest,
  csCenterChiefApprovalNextStatus,
  csTeamLeadApprovalNextStatus,
  isCsTeamDepartment,
  paymentRequestNeedsExecutiveDirectApproval,
  paymentRequestNeedsExecutiveFirstLineApproval,
} from "@/lib/finance-payment-request-policy";
import { getCsTeamDefaultPermissions } from "@/lib/cs-team-permissions";
import { authorizePaymentStatusChange } from "@/lib/finance-payment-request-authorize";

describe("finance payment approval flow", () => {
  it("routes transfer executor requests to executive first line", () => {
    expect(
      paymentRequestNeedsExecutiveFirstLineApproval("exec-1", "홍길동", ["exec-1"])
    ).toBe(true);
    expect(
      paymentRequestNeedsExecutiveFirstLineApproval("user-1", "홍길동", ["exec-1"])
    ).toBe(false);
    expect(
      paymentRequestNeedsExecutiveFirstLineApproval("user-2", "김소윤", [])
    ).toBe(true);
  });

  it("routes departments without team lead to executive direct approval", () => {
    const withLead = new Set(["마케팅", "경영지원"]);
    expect(paymentRequestNeedsExecutiveDirectApproval("마케팅", withLead)).toBe(false);
    expect(paymentRequestNeedsExecutiveDirectApproval("개발", withLead)).toBe(true);
    expect(paymentRequestNeedsExecutiveDirectApproval(null, withLead)).toBe(true);
  });

  it("limits team lead approval to same department", () => {
    const withLead = new Set(["마케팅", "경영지원"]);
    expect(canTeamLeadApprovePaymentRequest("마케팅", "마케팅", withLead)).toBe(true);
    expect(canTeamLeadApprovePaymentRequest("마케팅", "경영지원", withLead)).toBe(false);
    expect(canTeamLeadApprovePaymentRequest("마케팅", "개발", withLead)).toBe(false);
  });

  it("CS팀 only: center chief gate and next statuses", () => {
    expect(isCsTeamDepartment("CS팀")).toBe(true);
    expect(isCsTeamDepartment("CS")).toBe(false);
    expect(isCsTeamDepartment("마케팅")).toBe(false);

    expect(canCenterChiefApprovePaymentRequest("CENTER_CHIEF", "CS팀")).toBe(true);
    expect(canCenterChiefApprovePaymentRequest("CENTER_CHIEF", "마케팅")).toBe(false);
    expect(canCenterChiefApprovePaymentRequest("TEAM_LEAD", "CS팀")).toBe(false);

    expect(csTeamLeadApprovalNextStatus()).toBe("CENTER_CHIEF_APPROVED");
    expect(csCenterChiefApprovalNextStatus()).toBe("EXECUTIVE_PENDING");
  });

  it("CS팀 menu defaults hide tasks/quotations; lead/chief keep finance_view", () => {
    const userPerms = getCsTeamDefaultPermissions("USER");
    expect(userPerms).not.toContain("tasks");
    expect(userPerms).not.toContain("quotations");
    expect(userPerms).not.toContain("finance_view");

    const leadPerms = getCsTeamDefaultPermissions("TEAM_LEAD");
    expect(leadPerms).not.toContain("tasks");
    expect(leadPerms).not.toContain("quotations");
    expect(leadPerms).toContain("finance_view");
    expect(leadPerms).toContain("finance_approve");

    const chiefPerms = getCsTeamDefaultPermissions("CENTER_CHIEF");
    expect(chiefPerms).not.toContain("tasks");
    expect(chiefPerms).not.toContain("quotations");
    expect(chiefPerms).toContain("finance_view");
  });

  it("CS authorize chain: team lead cannot skip to EXECUTIVE_PENDING", () => {
    const base = {
      isTransferExecutor: false,
      needsExecutiveFirstLine: false,
      needsExecutiveDirect: false,
      isCsRequest: true,
    };
    expect(
      authorizePaymentStatusChange({
        ...base,
        cur: "PENDING",
        next: "CENTER_CHIEF_APPROVED",
        isTeamLead: true,
        isCenterChief: false,
        isExecutive: false,
      }).ok
    ).toBe(true);
    expect(
      authorizePaymentStatusChange({
        ...base,
        cur: "PENDING",
        next: "EXECUTIVE_PENDING",
        isTeamLead: true,
        isCenterChief: false,
        isExecutive: false,
      }).ok
    ).toBe(false);
    expect(
      authorizePaymentStatusChange({
        ...base,
        cur: "CENTER_CHIEF_APPROVED",
        next: "EXECUTIVE_PENDING",
        isTeamLead: false,
        isCenterChief: true,
        isExecutive: false,
      }).ok
    ).toBe(true);
    expect(
      authorizePaymentStatusChange({
        ...base,
        cur: "EXECUTIVE_PENDING",
        next: "TEAM_LEAD_APPROVED",
        isTeamLead: false,
        isCenterChief: false,
        isExecutive: true,
      }).ok
    ).toBe(true);
  });

  it("non-CS (마케팅/물류) authorize stays 2-step: PENDING → EXECUTIVE_PENDING", () => {
    const base = {
      isTransferExecutor: false,
      needsExecutiveFirstLine: false,
      needsExecutiveDirect: false,
      isCsRequest: false,
      isCenterChief: false,
    };
    expect(
      authorizePaymentStatusChange({
        ...base,
        cur: "PENDING",
        next: "EXECUTIVE_PENDING",
        isTeamLead: true,
        isExecutive: false,
      }).ok
    ).toBe(true);
    expect(
      authorizePaymentStatusChange({
        ...base,
        cur: "PENDING",
        next: "CENTER_CHIEF_APPROVED",
        isTeamLead: true,
        isExecutive: false,
      }).ok
    ).toBe(false);
    expect(
      authorizePaymentStatusChange({
        ...base,
        cur: "EXECUTIVE_PENDING",
        next: "TEAM_LEAD_APPROVED",
        isTeamLead: false,
        isExecutive: true,
      }).ok
    ).toBe(true);
  });
});
