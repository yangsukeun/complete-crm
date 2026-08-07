import { normalizeDepartment } from "@/lib/work-log-access";

/** Drive 부서 폴더와 동일: CS / CS팀 */
export function isCsDepartment(department: string | null | undefined): boolean {
  const d = normalizeDepartment(department);
  return d === "CS" || d === "CS팀";
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
