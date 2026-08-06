import { normalizeDepartment } from "@/lib/work-log-access";

export type DriveAccessActor = {
  userId: string;
  role: string;
  department: string;
};

export type DriveNode = {
  id: string;
  name: string;
  parentId: string | null;
  isFolder: boolean;
};

/** 상위 섹션 폴더명 (루트 직계) */
export const DRIVE_SECTION = {
  COMPANY: "01_회사공통",
  PROJECT: "02_프로젝트",
  DEPT: "03_부서별",
  SALES: "04_영업자료",
  MARKETING: "05_마케팅자료",
} as const;

/**
 * 03_부서별 하위 폴더명 → 허용 User.department.
 * 맵에 없으면 폴더명 === 부서명 1:1.
 */
export const DEPT_FOLDER_ALLOWED_DEPARTMENTS: Record<string, readonly string[]> = {
  마케팅: ["마케팅"],
  경영지원: ["경영지원"],
  물류: ["물류"],
  CS: ["CS", "CS팀"],
  CS팀: ["CS", "CS팀"],
};

/** 04_영업자료 — DB에 영업 부서 없음 → 일반 직원 불가(ADMIN/EXECUTIVE만) */
export const SALES_ALLOWED_DEPARTMENTS: readonly string[] = [];

/** 05_마케팅자료 */
export const MARKETING_SECTION_ALLOWED_DEPARTMENTS: readonly string[] = ["마케팅"];

export function isDriveFullAccessRole(role: string | null | undefined): boolean {
  const r = String(role ?? "").toUpperCase();
  return r === "ADMIN" || r === "EXECUTIVE";
}

export function allowedDeptsForDeptFolderName(folderName: string): readonly string[] {
  const mapped = DEPT_FOLDER_ALLOWED_DEPARTMENTS[folderName];
  if (mapped) return mapped;
  return [folderName];
}

function deptMatches(userDept: string, allowed: readonly string[]): boolean {
  if (!userDept) return false;
  return allowed.some((a) => normalizeDepartment(a) === userDept);
}

function topLevelName(chain: DriveNode[]): string | null {
  if (chain.length === 0) return null;
  const top = chain[chain.length - 1];
  return top?.name ?? null;
}

function deptFolderUnderSection03(chain: DriveNode[]): DriveNode | null {
  const idx03 = chain.findIndex((n) => n.name === DRIVE_SECTION.DEPT);
  if (idx03 < 0) return null;
  return idx03 > 0 ? chain[idx03 - 1]! : null;
}

/**
 * 조상 체인(file → … → 루트) 기준 접근 가능 여부.
 * ADMIN/EXECUTIVE = 전체 허용.
 */
export function canAccessDriveChain(actor: DriveAccessActor, chain: DriveNode[]): boolean {
  if (isDriveFullAccessRole(actor.role)) return true;
  if (chain.length === 0) return false;

  const top = topLevelName(chain);
  if (!top) return false;

  if (top === DRIVE_SECTION.COMPANY || top === DRIVE_SECTION.PROJECT) {
    return true;
  }

  if (top === DRIVE_SECTION.DEPT) {
    if (chain.length === 1) return true;
    const deptFolder = deptFolderUnderSection03(chain);
    if (!deptFolder) return true;
    return deptMatches(actor.department, allowedDeptsForDeptFolderName(deptFolder.name));
  }

  if (top === DRIVE_SECTION.SALES) {
    return deptMatches(actor.department, SALES_ALLOWED_DEPARTMENTS);
  }

  if (top === DRIVE_SECTION.MARKETING) {
    return deptMatches(actor.department, MARKETING_SECTION_ALLOWED_DEPARTMENTS);
  }

  return true;
}
