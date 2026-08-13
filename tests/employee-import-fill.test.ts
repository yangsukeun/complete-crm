import { describe, expect, it } from "vitest";
import { fillEmptyString, shouldFillJoinDate } from "@/lib/employee-import-fill";

describe("employee-import-fill", () => {
  it("fills only blank string fields", () => {
    expect(fillEmptyString(null, "010-1111-2222")).toBe("010-1111-2222");
    expect(fillEmptyString("", "010-1111-2222")).toBe("010-1111-2222");
    expect(fillEmptyString("010-0000-0000", "010-1111-2222")).toBeUndefined();
    expect(fillEmptyString(null, "")).toBeUndefined();
  });

  it("treats joinDate equal to createdAt (KST day) as placeholder", () => {
    const created = new Date("2026-08-12T10:00:00+09:00");
    const placeholder = new Date("2026-08-12T18:00:00+09:00");
    const real = new Date("2024-03-01T00:00:00+09:00");
    expect(shouldFillJoinDate(placeholder, created)).toBe(true);
    expect(shouldFillJoinDate(real, created)).toBe(false);
  });
});
