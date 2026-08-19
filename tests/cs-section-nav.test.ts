import { describe, expect, it } from "vitest";
import {
  csSectionNavItemActive,
  csSectionNavItems,
  isCsSectionPath,
} from "@/lib/cs-section-nav";

describe("cs section nav", () => {
  it("treats CS pages as the CS section, not the rest of CRM", () => {
    expect(isCsSectionPath("/cs-tools")).toBe(true);
    expect(isCsSectionPath("/cs-tools/away")).toBe(true);
    expect(isCsSectionPath("/cs-lounge?tab=lounge")).toBe(true);
    expect(isCsSectionPath("/cs-clients")).toBe(true);
    expect(isCsSectionPath("/cs-org")).toBe(true);
    expect(isCsSectionPath("/cs-org/settings")).toBe(true);
    expect(isCsSectionPath("/dashboard")).toBe(false);
    expect(isCsSectionPath("/leave")).toBe(false);
  });

  it("shows manager client label and away links only for overview roles", () => {
    const staff = csSectionNavItems({ canManageClients: false, canViewAwayOverview: false });
    expect(staff.map((i) => i.id)).toEqual(["hub", "notice", "lounge", "clients"]);
    expect(staff.find((i) => i.id === "clients")?.label).toBe("내 담당 업체");

    const lead = csSectionNavItems({ canManageClients: true, canViewAwayOverview: true });
    expect(lead.find((i) => i.id === "clients")?.label).toBe("업체 관리");
    expect(lead.map((i) => i.id)).toEqual([
      "hub",
      "notice",
      "lounge",
      "clients",
      "org",
      "org-month",
      "org-settings",
      "attendance",
      "away",
      "idle",
    ]);
  });

  it("highlights lounge tabs and nested client routes separately", () => {
    expect(csSectionNavItemActive({ id: "hub", pathname: "/cs-tools" })).toBe(true);
    expect(csSectionNavItemActive({ id: "hub", pathname: "/cs-tools/away" })).toBe(false);
    expect(csSectionNavItemActive({ id: "notice", pathname: "/cs-lounge", tab: "notice" })).toBe(true);
    expect(csSectionNavItemActive({ id: "lounge", pathname: "/cs-lounge", tab: "lounge" })).toBe(true);
    expect(csSectionNavItemActive({ id: "lounge", pathname: "/cs-lounge", tab: "notice" })).toBe(false);
    expect(csSectionNavItemActive({ id: "clients", pathname: "/cs-clients/abc" })).toBe(true);
    expect(csSectionNavItemActive({ id: "org", pathname: "/cs-org" })).toBe(true);
    expect(csSectionNavItemActive({ id: "org", pathname: "/cs-org/settings" })).toBe(false);
    expect(csSectionNavItemActive({ id: "org-settings", pathname: "/cs-org/settings" })).toBe(true);
    expect(csSectionNavItemActive({ id: "org-month", pathname: "/cs-org/month" })).toBe(true);
    expect(csSectionNavItemActive({ id: "away", pathname: "/cs-tools/away" })).toBe(true);
    expect(csSectionNavItemActive({ id: "idle", pathname: "/cs-tools/idle" })).toBe(true);
    expect(csSectionNavItemActive({ id: "idle", pathname: "/cs-tools/away" })).toBe(false);
  });
});
