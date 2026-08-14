import { describe, expect, it } from "vitest";
import { CS_CLIENT_SEED } from "@/lib/cs-client-seed-data";
import { csClientActiveFromPatch } from "@/lib/cs-client-serialize";

describe("CS_CLIENT_SEED", () => {
  it("has 64 unique names", () => {
    expect(CS_CLIENT_SEED).toHaveLength(64);
    expect(new Set(CS_CLIENT_SEED.map((r) => r[0])).size).toBe(64);
  });
});

describe("csClientActiveFromPatch", () => {
  it("treats empty endDate as active", () => {
    expect(csClientActiveFromPatch({ endDate: null })).toBe(true);
    expect(csClientActiveFromPatch({ endDate: "" })).toBe(true);
    expect(csClientActiveFromPatch({ endDate: "해지" })).toBe(false);
  });

  it("lets explicit toggle win over endDate", () => {
    expect(csClientActiveFromPatch({ endDate: "해지", isActive: true })).toBe(true);
    expect(csClientActiveFromPatch({ isActive: false })).toBe(false);
    expect(csClientActiveFromPatch({})).toBeUndefined();
  });
});
