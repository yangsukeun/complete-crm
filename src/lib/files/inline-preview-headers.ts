/** 첨부 인라인 미리보기용 Content-Disposition (inline) + 캐시. */

function dispositionStar(filename: string): string {
  const enc = encodeURIComponent(filename);
  return `inline; filename*=UTF-8''${enc}`;
}

export function inlinePreviewHeaders(displayFileName: string, mime: string): Record<string, string> {
  const nameLower = displayFileName.toLowerCase();
  const m = (mime || "application/octet-stream").toLowerCase().trim();

  if (m === "image/svg+xml" || nameLower.endsWith(".svg")) {
    return {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(displayFileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
    };
  }

  return {
    "Content-Type": m,
    "Content-Disposition": dispositionStar(displayFileName),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=3600",
  };
}
