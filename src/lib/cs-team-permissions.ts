import { normalizeDepartment } from "@/lib/work-log-access";
import {
  FEATURE_KEYS,
  getDefaultPermissionsForRole,
  type RoleName,
} from "@/lib/permissions";

/** 자금 결재 CS 분기와 동일 — 메뉴 숨김도 "CS팀"만 */
export function isCsTeamDepartment(department: string | null | undefined): boolean {
  return normalizeDepartment(department) === "CS팀";
}

const CS_HIDE = new Set(["tasks", "quotations", "finance_view"]);

/**
 * CS팀 USER / TEAM_LEAD / CENTER_CHIEF 기본 권한.
 * - tasks·quotations·finance_view 기본 제외
 * - TEAM_LEAD·CENTER_CHIEF 만 finance_view 다시 포함 (이체·승인 화면)
 * 다른 부서 기본값은 건드리지 않음 — 호출측에서 CS팀일 때만 사용.
 */
export function getCsTeamDefaultPermissions(role: string | null | undefined): string[] {
  const r = String(role ?? "USER").toUpperCase() as RoleName;
  if (r === "EXECUTIVE" || r === "ADMIN") {
    return [...FEATURE_KEYS];
  }
  const baseRole: RoleName =
    r === "TEAM_LEAD" || r === "CENTER_CHIEF" || r === "USER" ? (r === "CENTER_CHIEF" ? "TEAM_LEAD" : r) : "USER";
  // CENTER_CHIEF는 TEAM_LEAD 기본(승인 키 포함)에서 출발
  let list = getDefaultPermissionsForRole(baseRole).filter((k) => !CS_HIDE.has(k));
  if (r === "TEAM_LEAD" || r === "CENTER_CHIEF") {
    if (!list.includes("finance_view")) list = [...list, "finance_view"];
    if (!list.includes("finance_approve")) list = [...list, "finance_approve"];
    if (!list.includes("finance_request")) list = [...list, "finance_request"];
  }
  // CENTER_CHIEF 전용 키는 없음 — finance_approve로 자금 승인 UI 사용
  return list;
}
