import { normalizeDepartment } from "@/lib/work-log-access";
import { isCsDepartment } from "@/lib/cs-tools-access";
import {
  FEATURE_KEYS,
  getDefaultPermissionsForRole,
  type RoleName,
} from "@/lib/permissions";

/** 회사 3분할: 컴플리트 본사 / 투헌드래드 CS센터 / 물류창고 3PL */
export type OrgUnit = "HQ" | "CS" | "LOGISTICS";

function compactDept(department: string | null | undefined): string {
  return normalizeDepartment(department).replace(/\s+/g, "").toLowerCase();
}

/** CS센터(투헌드래드) — CS / CS팀 / CS센터 등 */
export function isCsOrgDepartment(department: string | null | undefined): boolean {
  if (isCsDepartment(department)) return true;
  const n = compactDept(department);
  if (!n) return false;
  if (n === "cs센터" || n === "cscenter") return true;
  if (n.includes("투헌")) return true;
  return false;
}

/** 물류창고 3PL */
export function isLogisticsOrgDepartment(department: string | null | undefined): boolean {
  const n = compactDept(department);
  if (!n) return false;
  if (n === "물류" || n === "물류팀" || n === "물류창고" || n === "3pl") return true;
  if (n.includes("3pl")) return true;
  return false;
}

/**
 * 대표·관리자는 본사(풀 CRM). 그 외는 부서로 CS / 3PL / 본사.
 */
export function resolveOrgUnit(opts: {
  role?: string | null;
  department?: string | null;
}): OrgUnit {
  const r = String(opts.role ?? "").toUpperCase();
  if (r === "ADMIN" || r === "EXECUTIVE") return "HQ";
  if (isLogisticsOrgDepartment(opts.department)) return "LOGISTICS";
  if (isCsOrgDepartment(opts.department)) return "CS";
  return "HQ";
}

export function homePathForOrg(org: OrgUnit): string {
  if (org === "CS") return "/cs-tools";
  if (org === "LOGISTICS") return "/logistics";
  return "/dashboard";
}

export function homePathForUser(opts: {
  role?: string | null;
  department?: string | null;
}): string {
  return homePathForOrg(resolveOrgUnit(opts));
}

function pathAllowed(path: string, prefixes: string[]): boolean {
  const p = path.split("?")[0] || path;
  return prefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

/** CS센터 직원 메뉴 — CS 링크·연차·스케줄·자금(권한 있는 경우) */
const CS_NAV_PREFIXES = [
  "/cs-tools",
  "/cs-lounge",
  "/cs-clients",
  "/cs-org",
  "/leave",
  "/schedule",
  "/finance/requests",
  "/profile",
  "/admin/employee-leave-summary",
];

/** 3PL 직원 메뉴 — 물류 홈·연차·이체·회사정보 */
const LOGISTICS_NAV_PREFIXES = [
  "/logistics",
  "/leave",
  "/finance/requests",
  "/admin/company",
  "/profile",
];

export function navHrefAllowedForOrg(href: string, org: OrgUnit): boolean {
  if (org === "HQ") return true;
  if (org === "CS") return pathAllowed(href, CS_NAV_PREFIXES);
  if (org === "LOGISTICS") return pathAllowed(href, LOGISTICS_NAV_PREFIXES);
  return true;
}

const LOGISTICS_ALLOW = new Set([
  "leave",
  "leave_approve",
  "finance_request",
  "finance_approve",
  "finance_view",
  "admin_company",
  "profile",
  "attendance",
]);

/** 3PL 기본 권한: 휴가·이체·회사정보. 프로젝트/게시판 제외 */
export function getLogisticsDefaultPermissions(role: string | null | undefined): string[] {
  const r = String(role ?? "USER").toUpperCase() as RoleName;
  if (r === "EXECUTIVE" || r === "ADMIN") {
    return [...FEATURE_KEYS];
  }
  const baseRole: RoleName = r === "TEAM_LEAD" || r === "USER" ? r : "USER";
  let list = getDefaultPermissionsForRole(baseRole).filter((k) => LOGISTICS_ALLOW.has(k));
  for (const k of ["leave", "finance_request", "finance_view", "admin_company", "profile"] as const) {
    if (!list.includes(k)) list = [...list, k];
  }
  if (r === "TEAM_LEAD") {
    if (!list.includes("leave_approve")) list = [...list, "leave_approve"];
    if (!list.includes("finance_approve")) list = [...list, "finance_approve"];
  }
  return list;
}
