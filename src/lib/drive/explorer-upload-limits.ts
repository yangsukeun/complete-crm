/** Google resumable 청크: 256KiB 배수, Vercel body 한도(≈4.5MB) 미만 */
export const EXPLORER_UPLOAD_CHUNK_BYTES = 256 * 1024 * 8; // 2MiB

/** 이 크기 초과 시 업로드 전 확인 모달 */
export const EXPLORER_UPLOAD_CONFIRM_BYTES = 1024 * 1024 * 1024; // 1GB

export const EXPLORER_UPLOAD_LARGE_CONFIRM_MESSAGE =
  "대용량 파일입니다. 업로드 중 탭을 닫으면 중단됩니다. 계속할까요?";

/** 크기 유효성만 검사 (상한 없음) */
export function assertExplorerUploadSize(
  size: number
): { ok: true } | { ok: false; error: string } {
  if (!Number.isFinite(size) || size < 0) {
    return { ok: false, error: "파일 크기가 올바르지 않습니다." };
  }
  return { ok: true };
}

export function needsLargeUploadConfirm(size: number): boolean {
  return Number.isFinite(size) && size > EXPLORER_UPLOAD_CONFIRM_BYTES;
}

export function formatUploadBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
