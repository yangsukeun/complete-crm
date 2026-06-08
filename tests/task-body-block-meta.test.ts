import { describe, expect, it } from "vitest";
import {
  blockMetaMapToDisplay,
  parseBlockMetaFromPayload,
  pruneBlockMeta,
  resolveTopLevelBlockId,
  stampTopLevelBlockMeta,
  type TaskBodyBlockMetaMap,
} from "@/lib/task-body-block-meta";
import { parseStoredTaskBody, serializeTaskBodyForStore } from "@/lib/task-body-description";

describe("task-body-block-meta", () => {
  it("stampTopLevelBlockMeta creates author on first edit", () => {
    const editor = {
      getTextCursorPosition: () => ({ block: { id: "child-1" } }),
      getParentBlock: (id: string) => (id === "child-1" ? { id: "top-1" } : undefined),
    };
    const next = stampTopLevelBlockMeta(editor, {}, { id: "u1", name: "양수근" }, "2026-06-05T10:00:00.000Z");
    expect(next["top-1"]).toEqual({
      authorId: "u1",
      authorName: "양수근",
      createdAt: "2026-06-05T10:00:00.000Z",
      editorId: "u1",
      editorName: "양수근",
      updatedAt: "2026-06-05T10:00:00.000Z",
    });
  });

  it("stampTopLevelBlockMeta keeps author and updates editor", () => {
    const existing: TaskBodyBlockMetaMap = {
      "top-1": {
        authorId: "u1",
        authorName: "양수근",
        createdAt: "2026-06-05T10:00:00.000Z",
        editorId: "u1",
        editorName: "양수근",
        updatedAt: "2026-06-05T10:00:00.000Z",
      },
    };
    const editor = {
      getTextCursorPosition: () => ({ block: { id: "top-1" } }),
      getParentBlock: () => undefined,
    };
    const next = stampTopLevelBlockMeta(editor, existing, { id: "u2", name: "김철수" }, "2026-06-05T11:00:00.000Z");
    expect(next["top-1"].authorId).toBe("u1");
    expect(next["top-1"].authorName).toBe("양수근");
    expect(next["top-1"].editorId).toBe("u2");
    expect(next["top-1"].editorName).toBe("김철수");
    expect(next["top-1"].updatedAt).toBe("2026-06-05T11:00:00.000Z");
  });

  it("resolveTopLevelBlockId walks parents", () => {
    const editor = {
      getParentBlock: (id: string) => {
        if (id === "c") return { id: "col" };
        if (id === "col") return { id: "top" };
        return undefined;
      },
    };
    expect(resolveTopLevelBlockId(editor, "c")).toBe("top");
    expect(resolveTopLevelBlockId(editor, "top")).toBe("top");
  });

  it("pruneBlockMeta removes stale ids", () => {
    const pruned = pruneBlockMeta(
      {
        a: {
          authorId: "1",
          authorName: "A",
          createdAt: "t",
          editorId: "1",
          editorName: "A",
          updatedAt: "t",
        },
        b: {
          authorId: "2",
          authorName: "B",
          createdAt: "t",
          editorId: "2",
          editorName: "B",
          updatedAt: "t",
        },
      },
      ["a"]
    );
    expect(Object.keys(pruned)).toEqual(["a"]);
  });

  it("parseBlockMetaFromPayload validates shape", () => {
    const parsed = parseBlockMetaFromPayload({
      blockMeta: {
        ok: {
          authorId: "u1",
          authorName: "양수근",
          createdAt: "2026-06-05T10:00:00.000Z",
          editorId: "u1",
          editorName: "양수근",
          updatedAt: "2026-06-05T10:00:00.000Z",
        },
        bad: { authorName: "only name" },
      },
    });
    expect(parsed?.ok.authorName).toBe("양수근");
    expect(parsed?.bad).toBeUndefined();
  });

  it("serialize and parse round-trip blockMeta", () => {
    const editor = {
      document: [{ id: "b1", type: "paragraph", content: [{ type: "text", text: "hello" }] }],
      blocksToMarkdownLossy: () => "hello",
    };
    const blockMeta: TaskBodyBlockMetaMap = {
      b1: {
        authorId: "u1",
        authorName: "양수근",
        createdAt: "2026-06-05T10:00:00.000Z",
        editorId: "u2",
        editorName: "김철수",
        updatedAt: "2026-06-05T11:00:00.000Z",
      },
    };
    const stored = serializeTaskBodyForStore(editor, { blockMeta });
    expect(stored).toContain("blockMeta");
    const parsed = parseStoredTaskBody(stored);
    expect(parsed?.format).toBe("blocks");
    if (parsed?.format === "blocks") {
      expect(parsed.blockMeta?.b1.editorName).toBe("김철수");
      const display = blockMetaMapToDisplay(parsed.blockMeta);
      expect(display.b1.editorName).toBe("김철수");
    }
  });
});
