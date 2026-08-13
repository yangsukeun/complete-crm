import { isCsDepartment } from "@/lib/cs-tools-access";
import { parsePermissions } from "@/lib/permissions";
import { isExecutiveOrAdmin } from "@/lib/role-access";

/** User.permissions 개별 지정으로만 부여. 역할 기본값으로는 이석 버튼을 열지 않음. */
export const AWAY_EXCEPTION_FEATURE = "attendance_away";

export const AWAY_STATUS_EVENT = "away-status-changed";

export type AwayTypeName = "BATHROOM" | "SMOKING";

export function isAwayType(v: unknown): v is AwayTypeName {
  return v === "BATHROOM" || v === "SMOKING";
}

export function awayTypeLabel(type: AwayTypeName): string {
  return type === "SMOKING" ? "흡연" : "화장실";
}

/**
 * 이석 버튼 노출·시작 API.
 * - CS부서(CS / CS팀)는 기본 허용
 * - 타부서(김소윤·김정우 등)는 User.permissions에 attendance_away가 있을 때만
 * - 대표/관리자라도 CS부서가 아니면 기본 미노출 (개별 키로만 예외)
 */
export function canUseAwayFeature(opts: {
  department: string | null | undefined;
  permissions?: string | null;
}): boolean {
  if (isCsDepartment(opts.department)) return true;
  const custom = parsePermissions(opts.permissions);
  return custom !== null && custom.includes(AWAY_EXCEPTION_FEATURE);
}

/** 이석 현황: CS팀 팀장·센터장 + 대표/관리자 */
export function canViewAwayOverview(opts: {
  role: string | null | undefined;
  department: string | null | undefined;
}): boolean {
  if (isExecutiveOrAdmin(opts.role)) return true;
  const r = String(opts.role ?? "").toUpperCase();
  if (r !== "TEAM_LEAD" && r !== "CENTER_CHIEF") return false;
  return isCsDepartment(opts.department);
}

export function notifyAwayStatusChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AWAY_STATUS_EVENT));
}
