/**
 * 클라이언트 업로드 검증 (/api/upload 와 동일 확장자 정책 유지)
 */

export const UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

/** 서버 `/api/upload` ALLOWED_EXTENSIONS 와 동기화 유지 */
export const UPLOAD_ALLOWED_EXTENSIONS_LIST = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "avif",
  "heic",
  "heif",
  "mp4",
  "mov",
  "avi",
  "webm",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "hwp",
  "hwpx",
  "txt",
  "html",
  "htm",
  "ogg",
  "m4v",
] as const;

export const UPLOAD_ALLOWED_EXT = new Set<string>(UPLOAD_ALLOWED_EXTENSIONS_LIST as unknown as string[]);

export const UPLOAD_TOAST_DURATION_MS = 5000;

export const UPLOAD_ERROR_MESSAGE = {
  extension: "지원하지 않는 파일 형식입니다.",
  size: "파일 크기가 100MB를 초과합니다.",
  server: "업로드 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
} as const;

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
  "application/vnd.hancom.hwpml.document": "hwp",
};

function extensionFromFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const i = base.lastIndexOf(".");
  if (i < 0) return "";
  return base.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** null 이면 통과, 아니면 거절 사유 키 */
export function getUploadClientRejectReason(file: File): "extension" | "size" | null {
  if (file.size > UPLOAD_MAX_BYTES) return "size";
  let ext = extensionFromFileName(file.name);
  if (!ext && file.type) {
    ext = MIME_TO_EXT[file.type.toLowerCase()] ?? "";
  }
  if (!ext || !UPLOAD_ALLOWED_EXT.has(ext)) return "extension";
  return null;
}

export async function getUploadErrorMessageFromResponse(res: Response): Promise<string> {
  let raw = "";
  try {
    const data = (await res.json()) as { error?: string };
    raw = typeof data.error === "string" ? data.error : "";
  } catch {
    raw = "";
  }
  if (res.status === 400) {
    if (/100MB|100\s*MB|이하만|초과합니다/i.test(raw)) return UPLOAD_ERROR_MESSAGE.size;
    if (/지원 형식|확장자|지원하지 않는/i.test(raw)) return UPLOAD_ERROR_MESSAGE.extension;
    return UPLOAD_ERROR_MESSAGE.server;
  }
  if (res.status >= 500 || !res.ok) return UPLOAD_ERROR_MESSAGE.server;
  return raw || UPLOAD_ERROR_MESSAGE.server;
}

/** 검증 후 /api/upload POST — 실패 시 Error(message) 던짐 */
export async function postUploadFile(file: File): Promise<{ url: string; name?: string }> {
  const reason = getUploadClientRejectReason(file);
  if (reason) {
    throw new Error(UPLOAD_ERROR_MESSAGE[reason]);
  }
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: formData, credentials: "include" });
  if (!res.ok) {
    throw new Error(await getUploadErrorMessageFromResponse(res));
  }
  const data = (await res.json()) as { url?: string; name?: string };
  const url = typeof data.url === "string" ? data.url.trim() : "";
  if (!url) throw new Error(UPLOAD_ERROR_MESSAGE.server);
  return { url, name: data.name };
}
