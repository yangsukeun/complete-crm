import type { PrismaClient } from "@prisma/client";
import { isCsTeamDepartment } from "@/lib/cs-team-permissions";
import { normalizeDepartment } from "@/lib/work-log-access";

export { normalizeDepartment };

/** 팀장 1차 승인·취소 처리: 신청자와 같은 부서(팀)만 허용 */
export function canTeamLeadManageLeaveApplicant(
  teamLeadDepartment: string | null | undefined,
  applicantDepartment: string | null | undefined
): boolean {
  const leadDept = normalizeDepartment(teamLeadDepartment);
  const applicantDept = normalizeDepartment(applicantDepartment);
  if (!leadDept || !applicantDept) return false;
  return leadDept === applicantDept;
}

/**
 * CS팀 한정: CENTER_CHIEF도 TEAM_LEAD와 같이 1차 승인 가능.
 * 타 부서 CENTER_CHIEF·자금 3단계는 해당 없음.
 */
export function canFirstApproveLeave(opts: {
  viewerRole: string | null | undefined;
  viewerDepartment: string | null | undefined;
  applicantDepartment: string | null | undefined;
}): boolean {
  const role = String(opts.viewerRole ?? "").toUpperCase();
  if (!canTeamLeadManageLeaveApplicant(opts.viewerDepartment, opts.applicantDepartment)) {
    return false;
  }
  if (role === "TEAM_LEAD") return true;
  return role === "CENTER_CHIEF" && isCsTeamDepartment(opts.viewerDepartment);
}

export type FirstApproverNotifyWhere =
  | { role: "TEAM_LEAD"; department: string }
  | { department: string; role: { in: ["TEAM_LEAD", "CENTER_CHIEF"] } };

/** 휴가 알림 대상 1차 승인자. CS팀은 팀장+센터장, 그 외는 팀장만. */
export function teamLeadNotifyWhereForApplicantDepartment(
  applicantDepartment: string | null | undefined
): FirstApproverNotifyWhere | null {
  const dept = normalizeDepartment(applicantDepartment);
  if (!dept) return null;
  if (isCsTeamDepartment(dept)) {
    return { department: dept, role: { in: ["TEAM_LEAD", "CENTER_CHIEF"] } };
  }
  return { role: "TEAM_LEAD", department: dept };
}

/** TEAM_LEAD가 등록된 부서명 집합(정규화) */
export async function fetchDepartmentsWithTeamLead(
  db: Pick<PrismaClient, "user">
): Promise<Set<string>> {
  const rows = await db.user.findMany({
    where: { role: "TEAM_LEAD", department: { not: null } },
    select: { department: true },
  });
  const set = new Set<string>();
  for (const row of rows) {
    const dept = normalizeDepartment(row.department);
    if (dept) set.add(dept);
  }
  return set;
}

export function departmentHasTeamLead(
  department: string | null | undefined,
  departmentsWithTeamLead: ReadonlySet<string>
): boolean {
  const dept = normalizeDepartment(department);
  if (!dept) return false;
  return departmentsWithTeamLead.has(dept);
}

/** 해당 부서에 팀장이 없으면 대표/임원이 PENDING에서 바로 최종 승인 */
export function needsExecutiveDirectLeaveApproval(
  applicantDepartment: string | null | undefined,
  departmentsWithTeamLead: ReadonlySet<string>
): boolean {
  const dept = normalizeDepartment(applicantDepartment);
  if (!dept) return true;
  return !departmentsWithTeamLead.has(dept);
}

/** 팀장 본인 휴가는 1차(팀장)를 건너뛰고 대표 최종만 받는다 */
export function applicantSkipsTeamLeadLeaveStep(applicantRole: string | null | undefined): boolean {
  return String(applicantRole ?? "").toUpperCase() === "TEAM_LEAD";
}

/** 대표/임원이 최종 승인·반려할 수 있는 상태인지 */
export function canExecutiveFinalApproveLeave(opts: {
  status: string;
  applicantDepartment: string | null | undefined;
  applicantRole: string | null | undefined;
  departmentsWithTeamLead: ReadonlySet<string>;
}): boolean {
  if (opts.status === "TEAM_LEAD_APPROVED") return true;
  if (opts.status !== "PENDING") return false;
  if (applicantSkipsTeamLeadLeaveStep(opts.applicantRole)) return true;
  return needsExecutiveDirectLeaveApproval(opts.applicantDepartment, opts.departmentsWithTeamLead);
}
