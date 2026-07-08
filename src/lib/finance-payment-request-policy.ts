/**
 * 결제 요청 1차 승인: 이체 담당자·김소윤 님이 올린 건은 대표/임원(EXECUTIVE·ADMIN)도 승인 가능.
 * (팀장 승인 경로는 그대로 유지)
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
