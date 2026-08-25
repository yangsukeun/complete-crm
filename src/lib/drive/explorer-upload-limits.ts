/** 탐색기 업로드 상한 (바이트). 조정 시 이 상수만 변경. */
export const EXPLORER_UPLOAD_MAX_BYTES = 500 * 1024 * 1024; // 500MB

/** Google resumable 청크: 256KiB 배수, Vercel body 한도(≈4.5MB) 미만 */
export const EXPLORER_UPLOAD_CHUNK_BYTES = 256 * 1024 * 8; // 2MiB

export const EXPLORER_UPLOAD_TOO_LARGE_MESSAGE =
  "영상 원본 등 대용량은 NAS 문서함 이용을 권장합니다. (탐색기 업로드는 500MB까지)";

export function assertExplorerUploadSize(
  size: number
): { ok: true } | { ok: false; error: string } {
  if (!Number.isFinite(size) || size < 0) {
    return { ok: false, error: "파일 크기가 올바르지 않습니다." };
  }
  if (size > EXPLORER_UPLOAD_MAX_BYTES) {
    return { ok: false, error: EXPLORER_UPLOAD_TOO_LARGE_MESSAGE };
  }
  return { ok: true };
}
