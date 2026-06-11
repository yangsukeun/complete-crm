import { describe, expect, it } from "vitest";
import {
  deOverlapMetaSlots,
  type BlockRowLayout,
} from "@/lib/body-meta-block-layout";

describe("body-meta-block-layout", () => {
  it("deOverlapMetaSlots keeps spaced rows aligned to blocks", () => {
    const input: BlockRowLayout[] = [
      { blockId: "a", top: 0, height: 24, slotHeight: 40 },
      { blockId: "b", top: 48, height: 24, slotHeight: 40 },
      { blockId: "c", top: 96, height: 24, slotHeight: 40 },
    ];
    const out = deOverlapMetaSlots(input);
    expect(out[0].top).toBe(0);
    expect(out[1].top).toBe(48);
    expect(out[2].top).toBe(96);
  });

  it("deOverlapMetaSlots pushes overlapping meta slots apart", () => {
    const input: BlockRowLayout[] = [
      { blockId: "a", top: 0, height: 24, slotHeight: 50 },
      { blockId: "b", top: 28, height: 24, slotHeight: 50 },
    ];
    const out = deOverlapMetaSlots(input);
    expect(out[0].top).toBe(0);
    expect(out[1].top).toBeGreaterThanOrEqual(50);
  });
});
