import { getYoutubeVideoId } from "@/lib/blocknote-youtube";

/** 붙여넣기 끝의 ),. 등 제거 */
export function stripTrailingJunkFromUrl(url: string): string {
  return url.replace(/[),.;>\]'"]+$/g, "");
}

export function isHttpUrlLine(s: string): boolean {
  return /^https?:\/\/\S+$/i.test((s ?? "").trim());
}

/** 클립보드 텍스트에서 단일 URL 추출 */
export function extractUrlFromPlainPaste(raw: string): string | null {
  const first = raw.trim().split(/\n/)[0]?.trim() ?? "";
  if (!first) return null;
  const cleaned = stripTrailingJunkFromUrl(first);
  if (isHttpUrlLine(cleaned)) return cleaned;
  const m = first.match(/https?:\/\/[^\s<>"']+/i);
  if (m) {
    const u = stripTrailingJunkFromUrl(m[0]);
    if (isHttpUrlLine(u)) return u;
  }
  return null;
}

export function isYoutubePastedUrl(s: string): boolean {
  return /youtube\.com|youtu\.be/i.test(s ?? "") || getYoutubeVideoId(s ?? "") !== null;
}
