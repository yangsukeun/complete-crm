/**
 * 탐색기 폴더 삭제·복원 권한 (파일 삭제 TEAM_LEAD 규칙과 분리)
 * - ADMIN/EXECUTIVE: 항상 허용
 * - createdBy === actorId: 허용
 * - createdBy null(동기화분) 또는 타인 생성: 일반/TEAM_LEAD 불가
 */
export function canManageExplorerFolderTrash(params: {
  role: string | null | undefined;
  actorId: string;
  createdBy: string | null | undefined;
}): boolean {
  const r = String(params.role ?? "").toUpperCase();
  if (r === "ADMIN" || r === "EXECUTIVE") return true;
  if (params.createdBy && params.createdBy === params.actorId) return true;
  return false;
}

/**
 * 탐색기 파일 휴지통 이동
 * - ADMIN/EXECUTIVE/TEAM_LEAD: 허용
 * - createdBy === 본인: USER도 허용
 * - createdBy null(동기화) · 타인 파일: 불가
 */
export function canTrashExplorerFile(params: {
  role: string | null | undefined;
  actorId: string;
  createdBy: string | null | undefined;
}): boolean {
  const r = String(params.role ?? "").toUpperCase();
  if (r === "ADMIN" || r === "EXECUTIVE" || r === "TEAM_LEAD") return true;
  if (params.createdBy && params.createdBy === params.actorId) return true;
  return false;
}

export function isDriveAdminRole(role: string | null | undefined): boolean {
  const r = String(role ?? "").toUpperCase();
  return r === "ADMIN" || r === "EXECUTIVE";
}
