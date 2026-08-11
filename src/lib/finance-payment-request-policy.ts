/**
 * 결제 요청 1차 승인: 이체 담당자·김소윤 님이 올린 건은 대표/임원(EXECUTIVE·ADMIN)도 승인 가능.
 * (팀장 승인 경로는 그대로 유지)
 *
 * CS팀만 3단계: 팀장 → 센터장(CENTER_CHIEF_APPROVED) → 대표(EXECUTIVE_PENDING) → 이체대기.
 * 마케팅/물류 등 다른 부서 로직은 변경하지 않음.
 */

import {
  canTeamLeadManageLeaveApplicant,
  needsExecutiveDirectLeaveApproval,
  normalizeDepartment,
} from "@/lib/leave-department-access";

export {
  canTeamLeadManageLeaveApplicant as canTeamLeadManagePaymentApplicant,
  fetchDepartmentsWithTeamLead,
  teamLeadNotifyWhereForApplicantDepartment,
  normalizeDepartment,
} from "@/lib/leave-department-access";

/** 자금 3단계 결재 분기용 — 정확히 "CS팀"만 (CS / CS팀 혼용 Drive 규칙과 분리) */
export function isCsTeamDepartment(department: string | null | undefined): boolean {
  return normalizeDepartment(department) === "CS팀";
}

export function isNamedKimSoYoon(name: string | null | undefined): boolean {
  const n = String(name ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return n === "김소윤";
}

/** 요청자가 이체 담당자이거나 이름이 김소윤이면 → 1차 승인에 대표/임원 참여 */
export function paymentRequestNeedsExecutiveFirstLineApproval(
  requesterId: string | null | undefined,
  requesterName: string | null | undefined,
  transferExecutorIds: readonly string[]
): boolean {
  if (!requesterId) return false;
  if (transferExecutorIds.includes(requesterId)) return true;
  return isNamedKimSoYoon(requesterName);
}

/** 팀장 없는 부서 신청 건은 대표/임원이 PENDING에서 바로 최종 승인 */
export function paymentRequestNeedsExecutiveDirectApproval(
  applicantDepartment: string | null | undefined,
  departmentsWithTeamLead: ReadonlySet<string>
): boolean {
  return needsExecutiveDirectLeaveApproval(applicantDepartment, departmentsWithTeamLead);
}

export function canTeamLeadApprovePaymentRequest(
  teamLeadDepartment: string | null | undefined,
  applicantDepartment: string | null | undefined,
  departmentsWithTeamLead: ReadonlySet<string>
): boolean {
  if (paymentRequestNeedsExecutiveDirectApproval(applicantDepartment, departmentsWithTeamLead)) {
    return false;
  }
  return canTeamLeadManageLeaveApplicant(teamLeadDepartment, applicantDepartment);
}

/**
 * CS팀 센터장 2차 승인.
 * role === CENTER_CHIEF 이고 신청자 부서가 CS팀일 때만 true.
 * (센터장 본인 department 불일치여도 신청자가 CS팀이면 허용 — 역할이 센터장 전제)
 */
export function canCenterChiefApprovePaymentRequest(
  actorRole: string | null | undefined,
  applicantDepartment: string | null | undefined
): boolean {
  if (String(actorRole ?? "").toUpperCase() !== "CENTER_CHIEF") return false;
  return isCsTeamDepartment(applicantDepartment);
}

/** CS팀 팀장 1차 승인 후 다음 상태 */
export function csTeamLeadApprovalNextStatus(): "CENTER_CHIEF_APPROVED" {
  return "CENTER_CHIEF_APPROVED";
}

/** CS팀 센터장 승인 후 다음 상태(기존 대표 대기) */
export function csCenterChiefApprovalNextStatus(): "EXECUTIVE_PENDING" {
  return "EXECUTIVE_PENDING";
}
