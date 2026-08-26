/** Google Drive thumbnailLink 크기 파라미터 조정 (=s220 → =s256 등) */
export function withDriveThumbnailSize(url: string, sizePx: number): string {
  const s = Math.min(1024, Math.max(64, Math.round(sizePx)));
  if (/=s\d+/i.test(url)) {
    return url.replace(/=s\d+/i, `=s${s}`);
  }
  try {
    const u = new URL(url);
    u.searchParams.set("sz", `w${s}`);
    return u.toString();
  } catch {
    const join = url.includes("?") ? "&" : "?";
    return `${url}${join}sz=w${s}`;
  }
}

export function clampThumbnailWidth(raw: string | null): number {
  if (raw == null || raw === "") return 256;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 256;
  return Math.min(512, Math.max(64, Math.round(n)));
}
