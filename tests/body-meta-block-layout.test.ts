import { describe, expect, it } from "vitest";
import {
  deOverlapMetaSlots,
  type BlockRowLayout,
} from "@/lib/body-meta-block-layout";

describe("body-meta-block-layout", () => {
  it("deOverlapMetaSlots pushes overlapping rows apart", () => {
    const input: BlockRowLayout[] = [
      { blockId: "a", top: 0, height: 24, slotHeight: 50 },
      { blockId: "b", top: 28, height: 24, slotHeight: 50 },
      { blockId: "c", top: 56, height: 24, slotHeight: 50 },
    ];
    const out = deOverlapMetaSlots(input);
    expect(out[0].top).toBe(0);
    expect(out[1].top).toBeGreaterThanOrEqual(out[0].top + out[0].slotHeight);
    expect(out[2].top).toBeGreaterThanOrEqual(out[1].top + out[1].slotHeight);
  });

  it("deOverlapMetaSlots preserves order when already spaced", () => {
    const input: BlockRowLayout[] = [
      { blockId: "a", top: 0, height: 40, slotHeight: 50 },
      { blockId: "b", top: 120, height: 40, slotHeight: 50 },
    ];
    const out = deOverlapMetaSlots(input);
    expect(out[0].top).toBe(0);
    expect(out[1].top).toBe(120);
  });
});
