import { describe, expect, it } from "vitest";
import { withDriveThumbnailSize, clampThumbnailWidth } from "@/lib/drive/thumbnail-link";

describe("withDriveThumbnailSize", () => {
  it("replaces =sNNN", () => {
    expect(withDriveThumbnailSize("https://lh3.googleusercontent.com/x=s220", 256)).toBe(
      "https://lh3.googleusercontent.com/x=s256"
    );
  });

  it("clamps width", () => {
    expect(clampThumbnailWidth("256")).toBe(256);
    expect(clampThumbnailWidth("9999")).toBe(512);
    expect(clampThumbnailWidth(null)).toBe(256);
  });
});
