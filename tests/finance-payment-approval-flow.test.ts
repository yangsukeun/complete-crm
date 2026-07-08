import { describe, expect, it } from "vitest";
import {
  canTeamLeadApprovePaymentRequest,
  paymentRequestNeedsExecutiveDirectApproval,
  paymentRequestNeedsExecutiveFirstLineApproval,
} from "@/lib/finance-payment-request-policy";

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
});
