import "server-only";

/**
 * /drive 탐색기·동기화 루트.
 * - GOOGLE_DRIVE_EXPLORER_FOLDER_ID 우선 (직원용 공유 드라이브)
 * - 없으면 GOOGLE_DRIVE_FOLDER_ID 폴백 (현행 동작 유지)
 *
 * GOOGLE_DRIVE_FOLDER_ID 자체는 업로드 전용 — 이 헬퍼가 값을 "바꾸지" 않음.
 */
export function getDriveExplorerRootId(): string {
  return (
    process.env.GOOGLE_DRIVE_EXPLORER_FOLDER_ID?.trim() ||
    process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() ||
    ""
  );
}

/** EXPLORER 전용 env가 실제로 설정됐는지 (폴백 여부와 무관) */
export function isDriveExplorerFolderConfigured(): boolean {
  return Boolean(process.env.GOOGLE_DRIVE_EXPLORER_FOLDER_ID?.trim());
}
