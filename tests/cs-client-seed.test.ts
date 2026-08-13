import { describe, expect, it } from "vitest";
import { CS_CLIENT_SEED } from "@/lib/cs-client-seed-data";

describe("CS_CLIENT_SEED", () => {
  it("has 64 unique names", () => {
    expect(CS_CLIENT_SEED).toHaveLength(64);
    expect(new Set(CS_CLIENT_SEED.map((r) => r[0])).size).toBe(64);
  });
});
