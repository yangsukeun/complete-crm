/**
 * /api/upload 및 클라이언트 검증 공통 정책 (옵션 B: 기본 허용 + 실행 확장자 차단)
 */

/** 단일 업로드 요청당 최대 바이트 */
export const UPLOAD_MAX_BYTES = 1024 * 1024 * 1024; // 1 GiB

/** UTC 기준 사용자당 일일 누적 업로드 바이트 상한 */
export const UPLOAD_DAILY_BYTES_PER_USER = 5 * 1024 * 1024 * 1024; // 5 GiB

/** 소문자 비교용 — 파일명 끝이 해당 접미사이면 차단 */
export const UPLOAD_BLOCKED_SUFFIXES = [
  ".exe",
  ".bat",
  ".cmd",
  ".scr",
  ".msi",
  ".com",
  ".vbs",
  ".ps1",
  ".jar",
] as const;

export function isUploadFileNameBlocked(fileName: string): boolean {
  const n = fileName.trim().toLowerCase();
  return UPLOAD_BLOCKED_SUFFIXES.some((s) => n.endsWith(s));
}

export function validateUploadFile(file: File): { ok: true } | { ok: false; error: string } {
  if (isUploadFileNameBlocked(file.name)) {
    return {
      ok: false,
      error: "실행 파일은 보안상 업로드할 수 없습니다. 압축 파일(.zip)로 보내주세요.",
    };
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    return { ok: false, error: "파일 크기는 1GB 이하여야 합니다." };
  }
  return { ok: true };
}

/** 다운로드 표시명·API 응답용 (경로·위험 문자 제거, 길이 제한) */
export function sanitizeUploadDisplayName(raw: string): string {
  const base = raw.trim().split(/[/\\]/).pop() ?? raw.trim();
  const cleaned = base.replace(/\.\./g, "_").replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200);
  return cleaned.length > 0 ? cleaned : "file";
}

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/ogg": "ogg",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "video/x-m4v": "m4v",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/html": "html",
  "application/x-hwp": "hwp",
  "application/haansofthwp": "hwp",
  "application/vnd.hancom.hwp": "hwp",
  "application/vnd.hancom.hwpx": "hwpx",
  "application/vnd.hancom.hwpml.document": "hwpx",
  "application/x-hwpml": "hwpx",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "multipart/x-zip": "zip",
  "application/x-rar-compressed": "rar",
  "application/vnd.rar": "rar",
  "application/x-7z-compressed": "7z",
  "text/csv": "csv",
  "application/csv": "csv",
  "text/comma-separated-values": "csv",
};

/** 저장 파일명용 확장자 (알파벳·숫자만, 최대 32자; 없으면 bin) */
export function inferStorageExtension(mime: string, fileName: string): string {
  const m = (mime || "").toLowerCase();
  if (MIME_TO_EXT[m]) return MIME_TO_EXT[m];
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  if (dot >= 0) {
    const ext = base
      .slice(dot + 1)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (ext && ext.length <= 32) return ext;
  }
  return "bin";
}
