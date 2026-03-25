/**
 * DB·본문에 저장된 링크에서 Drive 파일 ID 추출 (클라이언트 번들 안전 — googleapis 미사용).
 * - https://drive.google.com/file/d/FILE_ID/view?usp=...
 * - //drive.google.com/... (프로토콜 상대)
 * - drive.google.com/... (스킴 없음)
 * - /file/d/ID/... (경로만)
 * - open?id=FILE_ID, uc?export=view&id=, thumbnail?id=
 */
export function parseGoogleDriveFileIdFromUrl(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;

  let s = raw;
  if (s.startsWith("//")) s = `https:${s}`;
  else if (!/^https?:\/\//i.test(s) && /drive\.google\.com/i.test(s)) s = `https://${s.replace(/^\/+/, "")}`;

  const pathMatch = /drive\.google\.com\/file\/d\/([^/?#]+)/i.exec(s);
  if (pathMatch) {
    let seg = pathMatch[1].trim();
    try {
      seg = decodeURIComponent(seg);
    } catch {
      /* keep seg */
    }
    if (seg.length < 5) return null;
    return seg;
  }

  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "drive.google.com") return null;
    const id = u.searchParams.get("id");
    if (!id) return null;
    let decoded = id.trim();
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      /* keep decoded */
    }
    if (decoded.length < 5) return null;
    return decoded;
  } catch {
    return null;
  }
}
