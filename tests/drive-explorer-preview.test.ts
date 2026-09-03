import { describe, expect, it } from "vitest";
import {
  explorerPreviewNeighbors,
  isExplorerImageFile,
} from "@/lib/drive/explorer-preview";

describe("isExplorerImageFile", () => {
  it("파일명 확장자로 이미지를 판별한다", () => {
    expect(isExplorerImageFile({ name: "a.jpg", mimeType: "application/octet-stream" })).toBe(
      true
    );
    expect(isExplorerImageFile({ name: "a.png", mimeType: null })).toBe(true);
    expect(isExplorerImageFile({ name: "a.pdf", mimeType: "application/pdf" })).toBe(false);
  });

  it("폴더·업로드 중은 제외한다", () => {
    expect(isExplorerImageFile({ name: "a.jpg", isFolder: true })).toBe(false);
    expect(isExplorerImageFile({ name: "a.jpg", uploading: true })).toBe(false);
  });
});

describe("explorerPreviewNeighbors", () => {
  const files = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("이전·다음을 순환한다", () => {
    expect(explorerPreviewNeighbors(files, "a")).toEqual({
      index: 0,
      prev: { id: "c" },
      next: { id: "b" },
    });
    expect(explorerPreviewNeighbors(files, "b")).toEqual({
      index: 1,
      prev: { id: "a" },
      next: { id: "c" },
    });
  });

  it("한 장이면 이동하지 않는다", () => {
    expect(explorerPreviewNeighbors([{ id: "a" }], "a")).toEqual({
      index: 0,
      prev: null,
      next: null,
    });
  });
});
