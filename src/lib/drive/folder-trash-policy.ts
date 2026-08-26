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

/**
 * 탐색기 이름 변경
 * - 폴더: 생성자 또는 ADMIN/EXECUTIVE (삭제와 동일)
 * - 파일: TEAM_LEAD+ 또는 본인 업로드 — 단 createdBy null(동기화)은 ADMIN/EXECUTIVE만
 */
export function canRenameExplorerItem(params: {
  role: string | null | undefined;
  actorId: string;
  createdBy: string | null | undefined;
  isFolder: boolean;
}): boolean {
  if (params.isFolder) {
    return canManageExplorerFolderTrash({
      role: params.role,
      actorId: params.actorId,
      createdBy: params.createdBy,
    });
  }
  if (!params.createdBy) {
    return isDriveAdminRole(params.role);
  }
  return canTrashExplorerFile({
    role: params.role,
    actorId: params.actorId,
    createdBy: params.createdBy,
  });
}

export function isDriveAdminRole(role: string | null | undefined): boolean {
  const r = String(role ?? "").toUpperCase();
  return r === "ADMIN" || r === "EXECUTIVE";
}

/** 이름 변경용 표시명 정리 */
export function sanitizeExplorerRenameName(
  raw: unknown
): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof raw !== "string") {
    return { ok: false, error: "이름이 올바르지 않습니다." };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "이름을 입력하세요." };
  }
  const cleaned = trimmed
    .replace(/[/\\?%*:|"<>]/g, "")
    .replace(/\0/g, "")
    .slice(0, 255)
    .trim();
  if (!cleaned) {
    return { ok: false, error: "사용할 수 있는 이름이 없습니다." };
  }
  return { ok: true, name: cleaned };
}
