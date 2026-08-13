import { normalizeDepartment } from "@/lib/work-log-access";

/** Prisma 필터용 — isCsDepartment 와 동일 별칭 */
export const CS_DEPARTMENT_ALIASES = ["CS", "CS팀"] as const;

/** Drive 부서 폴더와 동일: CS / CS팀 */
export function isCsDepartment(department: string | null | undefined): boolean {
  const d = normalizeDepartment(department);
  return d === "CS" || d === "CS팀";
}

/** 휴가 칩·목록 격리용 CS 그룹 (팀장·센터장 포함, 부서만 본다) */
export function isCsGroup(department: string | null | undefined): boolean {
  return isCsDepartment(department);
}

/** 대시보드 CS 링크 허브 카드 — CS 부서 + 관리·임원 */
export function canSeeCsToolsDashboardCard(opts: {
  role: string | null | undefined;
  department: string | null | undefined;
}): boolean {
  const r = String(opts.role ?? "").toUpperCase();
  if (r === "ADMIN" || r === "EXECUTIVE") return true;
  return isCsDepartment(opts.department);
}
