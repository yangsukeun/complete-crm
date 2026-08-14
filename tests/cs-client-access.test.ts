import { describe, expect, it } from "vitest";
import { csClientListWhere, csClientNavLabel } from "@/lib/cs-client-access";

describe("cs client access labels", () => {
  it("splits manager vs staff nav copy", () => {
    expect(csClientNavLabel(true)).toBe("업체 관리");
    expect(csClientNavLabel(false)).toBe("내 담당 업체");
  });

  it("filters list to assigned rows for staff", () => {
    expect(csClientListWhere("u1", true)).toEqual({ deletedAt: null });
    expect(csClientListWhere("u1", false)).toEqual({
      deletedAt: null,
      assignments: { some: { userId: "u1" } },
    });
  });
});
