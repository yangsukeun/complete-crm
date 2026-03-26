/**
 * Vercel Image Optimization 우회: 지정 외부 호스트는 원본 CDN을 그대로 사용
 * (유튜브·드라이브·Canva 등 — 무료 플랜 최적화 쿼터·지연 방지)
 */
export function isUnoptimizedRemoteImageSrc(src: string): boolean {
  if (!src || src.startsWith("/") || src.startsWith("data:")) return false;
  try {
    const u = new URL(src);
    const h = u.hostname.toLowerCase();
    if (h === "img.youtube.com" || h === "i.ytimg.com") return true;
    if (h === "drive.google.com" || h.includes("googleusercontent.com")) return true;
    if (h === "canva.com" || h.endsWith(".canva.com")) return true;
    return false;
  } catch {
    return false;
  }
}
