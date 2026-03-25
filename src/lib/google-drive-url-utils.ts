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
  else if (!/^https?:\/\//i.test(s) && /drive\.google\.com|googleusercontent\.com/i.test(s)) {
    s = `https://${s.replace(/^\/+/, "")}`;
  }

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

  /** 이미지 프록시: https://lh3.googleusercontent.com/d/FILE_ID */
  const gucPath = /\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/i.exec(s);
  if (gucPath) {
    const seg = gucPath[1]!.trim();
    if (seg.length >= 5) return seg;
  }

  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "drive.google.com") {
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
    }
    /** drive.usercontent.google.com/uc?export=download&id= */
    if (host === "drive.usercontent.google.com" || host.endsWith(".googleusercontent.com")) {
      const id = u.searchParams.get("id");
      if (id) {
        const decoded = id.trim();
        if (decoded.length >= 5) return decoded;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** 본문 문자열(마크다운/HTML) 안의 drive.google.com 링크에서 파일 ID 수집 */
export function collectGoogleDriveFileIdsFromText(text: string | null | undefined): string[] {
  const ids = new Set<string>();
  const s = text ?? "";
  const re = /https?:\/\/[^\s<>"')]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const u = m[0].replace(/[),.;>'"`]+$/g, "");
    if (!/drive\.google\.com|googleusercontent\.com/i.test(u)) continue;
    const id = parseGoogleDriveFileIdFromUrl(u);
    if (id) ids.add(id);
  }
  return [...ids];
}
