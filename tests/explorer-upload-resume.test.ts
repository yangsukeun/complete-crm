import { describe, expect, it } from "vitest";
import { parseUploadedOffsetFromRange } from "@/lib/drive/explorer-resumable-upload";
import {
  assertExplorerUploadSize,
  needsLargeUploadConfirm,
  EXPLORER_UPLOAD_CONFIRM_BYTES,
} from "@/lib/drive/explorer-upload-limits";

describe("explorer upload limits", () => {
  it("has no hard max — only validates finite size", () => {
    expect(assertExplorerUploadSize(2 * 1024 * 1024 * 1024).ok).toBe(true);
    expect(assertExplorerUploadSize(-1).ok).toBe(false);
  });

  it("asks confirm above 1GB", () => {
    expect(needsLargeUploadConfirm(EXPLORER_UPLOAD_CONFIRM_BYTES)).toBe(false);
    expect(needsLargeUploadConfirm(EXPLORER_UPLOAD_CONFIRM_BYTES + 1)).toBe(true);
  });
});

describe("parseUploadedOffsetFromRange", () => {
  it("parses Google Range header to next byte offset", () => {
    expect(parseUploadedOffsetFromRange("bytes=0-2097151")).toBe(2097152);
    expect(parseUploadedOffsetFromRange(null)).toBeNull();
  });
});
