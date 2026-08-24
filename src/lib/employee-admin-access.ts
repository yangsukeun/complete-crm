import { hasPermission, type RoleName } from "@/lib/permissions";

/** 직원 관리에서 대표와 동일한 CRUD·비밀번호 재설정 권한을 갖는 직책 */
export const MANAGEMENT_MANAGER_POSITION = "경영관리 매니저";

export type EmployeeManagerKind =
  | "privileged"
  | "management_manager"
  | "employee_manage"
  | "none";

export function isManagementManagerPosition(position: string | null | undefined): boolean {
  return (position ?? "").trim() === MANAGEMENT_MANAGER_POSITION;
}

export function isPrivilegedStaffRole(role: string | null | undefined): boolean {
  const r = String(role ?? "").toUpperCase();
  return r === "EXECUTIVE" || r === "ADMIN";
}

/**
 * 직원 관리 접근 경로.
 * - privileged: ADMIN/EXECUTIVE
 * - management_manager: 직책「경영관리 매니저」(기존)
 * - employee_manage: 기능 권한 키 위임
 */
export function resolveEmployeeManagerKind(opts: {
  role?: string | null;
  position?: string | null;
  permissionsJson?: string | null;
}): EmployeeManagerKind {
  if (isPrivilegedStaffRole(opts.role)) return "privileged";
  if (isManagementManagerPosition(opts.position)) return "management_manager";
  const r = String(opts.role ?? "USER").toUpperCase() as RoleName;
  if (hasPermission(r, opts.permissionsJson, "employee_manage")) return "employee_manage";
  return "none";
}

/** 직원 관리 화면·API (대표/관리자 · 경영관리 매니저 · employee_manage) */
export function canManageEmployeesSync(opts: {
  role?: string | null;
  position?: string | null;
  permissionsJson?: string | null;
}): boolean {
  return resolveEmployeeManagerKind(opts) !== "none";
}

/** 대표/관리자 계정 삭제·비밀번호 변경은 역할이 대표·관리자일 때만 */
export function canMutatePrivilegedEmployeeAccount(viewerRole: string | null | undefined): boolean {
  return isPrivilegedStaffRole(viewerRole);
}

/** employee_manage 위임자 — role/권한 상향·관리자 계정 수정 금지 */
export function isEmployeeManageDelegate(kind: EmployeeManagerKind): boolean {
  return kind === "employee_manage";
}
