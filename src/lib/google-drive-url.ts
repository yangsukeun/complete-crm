import { parseGoogleDriveFileIdFromUrl } from "@/lib/google-drive-url-utils";

/**
 * 구글 드라이브 공유 URL → Google CDN 이미지 URL (직접 표시용, 빠른 로딩)
 * @see https://lh3.googleusercontent.com/d/FILE_ID
 */
export function getDriveImageUrl(url: string): string {
  const id = parseGoogleDriveFileIdFromUrl(url);
  if (!id) return url;
  return `https://lh3.googleusercontent.com/d/${id}`;
}

/**
 * 구글 드라이브 URL → 리사이즈 썸네일 (목록·카드용)
 * @param size 최대 너비(px), Google Drive thumbnail API sz=w{N}
 */
export function getDriveThumbnailUrl(url: string, size = 400): string {
  const id = parseGoogleDriveFileIdFromUrl(url);
  if (!id) return url;
  const w = Math.max(64, Math.min(2000, Math.round(size)));
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${w}`;
}

/** 첨부 다운로드·새 탭 열기: 미리보기(/view) 대신 직접 다운로드 */
export function getDriveDownloadUrl(url: string): string {
  const id = parseGoogleDriveFileIdFromUrl(url);
  if (!id) return url;
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
}
