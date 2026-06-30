import type { PrismaClient } from "@prisma/client";
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

/** 휴가 알림 대상 팀장 조회용 Prisma where (신청자 부서와 일치하는 TEAM_LEAD) */
export function teamLeadNotifyWhereForApplicantDepartment(
  applicantDepartment: string | null | undefined
): { role: "TEAM_LEAD"; department: string } | null {
  const dept = normalizeDepartment(applicantDepartment);
  if (!dept) return null;
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
