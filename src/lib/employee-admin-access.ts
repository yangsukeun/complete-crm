/** 직원 관리에서 대표와 동일한 CRUD·비밀번호 재설정 권한을 갖는 직책 */
export const MANAGEMENT_MANAGER_POSITION = "경영관리 매니저";

export function isManagementManagerPosition(position: string | null | undefined): boolean {
  return (position ?? "").trim() === MANAGEMENT_MANAGER_POSITION;
}

export function isPrivilegedStaffRole(role: string | null | undefined): boolean {
  const r = String(role ?? "").toUpperCase();
  return r === "EXECUTIVE" || r === "ADMIN";
}

/** 직원 관리 화면·API (대표/관리자 또는 경영관리 매니저) */
export function canManageEmployeesSync(opts: {
  role?: string | null;
  position?: string | null;
}): boolean {
  if (isPrivilegedStaffRole(opts.role)) return true;
  return isManagementManagerPosition(opts.position);
}

/** 대표/관리자 계정 삭제·비밀번호 변경은 역할이 대표·관리자일 때만 */
export function canMutatePrivilegedEmployeeAccount(viewerRole: string | null | undefined): boolean {
  return isPrivilegedStaffRole(viewerRole);
}
