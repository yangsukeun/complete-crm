import { describe, expect, it } from "vitest";
import {
  canApproveQuotationDelete,
  canRequestQuotationDelete,
} from "@/lib/quotation-delete-access";

describe("quotation delete access", () => {
  it("allows team-lead level to approve/delete", () => {
    expect(canApproveQuotationDelete("TEAM_LEAD")).toBe(true);
    expect(canApproveQuotationDelete("CENTER_CHIEF")).toBe(true);
    expect(canApproveQuotationDelete("EXECUTIVE")).toBe(true);
    expect(canApproveQuotationDelete("ADMIN")).toBe(true);
    expect(canApproveQuotationDelete("USER")).toBe(false);
  });

  it("lets the issuer request delete only when not team-lead level", () => {
    expect(
      canRequestQuotationDelete({ role: "USER", userId: "u1", issuedById: "u1" })
    ).toBe(true);
    expect(
      canRequestQuotationDelete({ role: "USER", userId: "u1", issuedById: "other" })
    ).toBe(false);
    expect(
      canRequestQuotationDelete({ role: "TEAM_LEAD", userId: "u1", issuedById: "u1" })
    ).toBe(false);
  });
});
