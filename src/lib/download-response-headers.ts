/** 첨부 프록시·다운로드 응답용: XSS 완화(nosniff, SVG 비인라인, 일반 파일 attachment). */

function dispositionStar(filename: string, mode: "inline" | "attachment"): string {
  const enc = encodeURIComponent(filename);
  return `${mode}; filename*=UTF-8''${enc}`;
}

function guessImageMimeFromFilename(name: string): string | null {
  const n = name.toLowerCase();
  const pairs: [string, string][] = [
    [".jpg", "image/jpeg"],
    [".jpeg", "image/jpeg"],
    [".png", "image/png"],
    [".gif", "image/gif"],
    [".webp", "image/webp"],
    [".bmp", "image/bmp"],
    [".avif", "image/avif"],
    [".heic", "image/heic"],
    [".heif", "image/heif"],
    [".ico", "image/x-icon"],
  ];
  for (const [ext, mime] of pairs) {
    if (n.endsWith(ext)) return mime;
  }
  return null;
}

/**
 * image/* 는 인라인 허용(미리보기). image/svg+xml 만 attachment + octet-stream.
 * 그 외는 attachment + application/octet-stream.
 */
export function secureDownloadHeaders(
  displayFileName: string,
  upstreamContentType: string | null | undefined
): Record<string, string> {
  const nameLower = displayFileName.toLowerCase();
  const upstream = (upstreamContentType || "").toLowerCase().trim();

  if (upstream === "image/svg+xml" || nameLower.endsWith(".svg")) {
    return {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": dispositionStar(displayFileName, "attachment"),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
    };
  }

  if (upstream.startsWith("image/")) {
    return {
      "Content-Type": upstream,
      "Content-Disposition": dispositionStar(displayFileName, "inline"),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
    };
  }

  const guessed = guessImageMimeFromFilename(displayFileName);
  if (guessed) {
    return {
      "Content-Type": guessed,
      "Content-Disposition": dispositionStar(displayFileName, "inline"),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
    };
  }

  return {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": dispositionStar(displayFileName, "attachment"),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-cache",
  };
}
