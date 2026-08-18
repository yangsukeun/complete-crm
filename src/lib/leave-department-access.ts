import type { PrismaClient } from "@prisma/client";
import { isCsDepartment } from "@/lib/cs-tools-access";
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

/** CS 사원·팀장 휴가: 팀장 1차 → 센터장 최종. 센터장 본인만 대표. */
export function csLeaveFinalIsCenterChief(
  applicantDepartment: string | null | undefined,
  applicantRole: string | null | undefined
): boolean {
  if (!isCsDepartment(applicantDepartment)) return false;
  return String(applicantRole ?? "").toUpperCase() !== "CENTER_CHIEF";
}

/**
 * 1차 승인: 같은 부서 팀장만.
 * CS 센터장은 2차(최종)이지 1차가 아니다.
 */
export function canFirstApproveLeave(opts: {
  viewerRole: string | null | undefined;
  viewerDepartment: string | null | undefined;
  applicantDepartment: string | null | undefined;
}): boolean {
  const role = String(opts.viewerRole ?? "").toUpperCase();
  if (role !== "TEAM_LEAD") return false;
  return canTeamLeadManageLeaveApplicant(opts.viewerDepartment, opts.applicantDepartment);
}

export type FirstApproverNotifyWhere = { role: "TEAM_LEAD"; department: string };

/** 휴가 알림 대상 1차 승인자(팀장). CS 센터장은 1차 후 따로 알린다. */
export function teamLeadNotifyWhereForApplicantDepartment(
  applicantDepartment: string | null | undefined
): FirstApproverNotifyWhere | null {
  const dept = normalizeDepartment(applicantDepartment);
  if (!dept) return null;
  return { role: "TEAM_LEAD", department: dept };
}

export function centerChiefNotifyWhereForApplicantDepartment(
  applicantDepartment: string | null | undefined
): { role: "CENTER_CHIEF"; department: string } | null {
  const dept = normalizeDepartment(applicantDepartment);
  if (!dept) return null;
  return { role: "CENTER_CHIEF", department: dept };
}

/** 신청 직후 알림 대상. CS 사원·팀장은 대표에게 보내지 않는다. */
export function leaveNewRequestNotifyWhere(opts: {
  applicantDepartment: string | null | undefined;
  applicantRole: string | null | undefined;
  skipTeamLeadStep: boolean;
}):
  | { role: "TEAM_LEAD"; department: string }
  | { role: "CENTER_CHIEF"; department: string }
  | { OR: Array<{ role: { in: ["EXECUTIVE", "ADMIN"] } } | FirstApproverNotifyWhere> } {
  if (csLeaveFinalIsCenterChief(opts.applicantDepartment, opts.applicantRole)) {
    if (opts.skipTeamLeadStep) {
      return (
        centerChiefNotifyWhereForApplicantDepartment(opts.applicantDepartment) ?? {
          OR: [{ role: { in: ["EXECUTIVE", "ADMIN"] } }],
        }
      );
    }
    return (
      teamLeadNotifyWhereForApplicantDepartment(opts.applicantDepartment) ?? {
        OR: [{ role: { in: ["EXECUTIVE", "ADMIN"] } }],
      }
    );
  }
  const first = opts.skipTeamLeadStep
    ? null
    : teamLeadNotifyWhereForApplicantDepartment(opts.applicantDepartment);
  return {
    OR: [{ role: { in: ["EXECUTIVE", "ADMIN"] } }, ...(first ? [first] : [])],
  };
}

/** 1차 승인 후 최종 승인자 알림. CS 사원·팀장 → 센터장, 그 외 → 대표. */
export function leaveAfterFirstApprovalNotifyWhere(opts: {
  applicantDepartment: string | null | undefined;
  applicantRole: string | null | undefined;
}): { role: "CENTER_CHIEF"; department: string } | { role: { in: ["EXECUTIVE", "ADMIN"] } } {
  if (csLeaveFinalIsCenterChief(opts.applicantDepartment, opts.applicantRole)) {
    return (
      centerChiefNotifyWhereForApplicantDepartment(opts.applicantDepartment) ?? {
        role: { in: ["EXECUTIVE", "ADMIN"] },
      }
    );
  }
  return { role: { in: ["EXECUTIVE", "ADMIN"] } };
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

/** 해당 부서에 팀장이 없으면 최종 권한자가 PENDING에서 바로 승인 */
export function needsExecutiveDirectLeaveApproval(
  applicantDepartment: string | null | undefined,
  departmentsWithTeamLead: ReadonlySet<string>
): boolean {
  const dept = normalizeDepartment(applicantDepartment);
  if (!dept) return true;
  return !departmentsWithTeamLead.has(dept);
}

/** 팀장·센터장 본인 휴가는 1차(팀장)를 건너뛴다 */
export function applicantSkipsTeamLeadLeaveStep(applicantRole: string | null | undefined): boolean {
  const r = String(applicantRole ?? "").toUpperCase();
  return r === "TEAM_LEAD" || r === "CENTER_CHIEF";
}

function pendingGoesStraightToFinal(opts: {
  applicantDepartment: string | null | undefined;
  applicantRole: string | null | undefined;
  departmentsWithTeamLead: ReadonlySet<string>;
}): boolean {
  if (applicantSkipsTeamLeadLeaveStep(opts.applicantRole)) return true;
  return needsExecutiveDirectLeaveApproval(opts.applicantDepartment, opts.departmentsWithTeamLead);
}

/** CS 센터장: 같은 부서 CS 사원·팀장 휴가를 최종 승인 */
export function canCsCenterChiefFinalApproveLeave(opts: {
  viewerRole: string | null | undefined;
  viewerDepartment: string | null | undefined;
  applicantDepartment: string | null | undefined;
  applicantRole: string | null | undefined;
  status: string;
  departmentsWithTeamLead: ReadonlySet<string>;
}): boolean {
  if (String(opts.viewerRole ?? "").toUpperCase() !== "CENTER_CHIEF") return false;
  if (!isCsDepartment(opts.viewerDepartment)) return false;
  if (!csLeaveFinalIsCenterChief(opts.applicantDepartment, opts.applicantRole)) return false;
  if (!canTeamLeadManageLeaveApplicant(opts.viewerDepartment, opts.applicantDepartment)) {
    return false;
  }
  if (opts.status === "TEAM_LEAD_APPROVED") return true;
  if (opts.status !== "PENDING") return false;
  return pendingGoesStraightToFinal(opts);
}

/** 대표/임원이 최종 승인·반려할 수 있는 상태인지. CS 사원·팀장은 센터장 전용. */
export function canExecutiveFinalApproveLeave(opts: {
  status: string;
  applicantDepartment: string | null | undefined;
  applicantRole: string | null | undefined;
  departmentsWithTeamLead: ReadonlySet<string>;
}): boolean {
  if (csLeaveFinalIsCenterChief(opts.applicantDepartment, opts.applicantRole)) return false;
  if (opts.status === "TEAM_LEAD_APPROVED") return true;
  if (opts.status !== "PENDING") return false;
  return pendingGoesStraightToFinal(opts);
}

export function canFinalizeLeaveCancel(opts: {
  cancelFromStatus: string | null | undefined;
  viewerRole: string | null | undefined;
  viewerDepartment: string | null | undefined;
  applicantDepartment: string | null | undefined;
  applicantRole: string | null | undefined;
  departmentsWithTeamLead: ReadonlySet<string>;
}): boolean {
  const from = opts.cancelFromStatus;
  if (!from) return false;
  const role = String(opts.viewerRole ?? "").toUpperCase();
  const exec = role === "EXECUTIVE" || role === "ADMIN";

  if (from === "PENDING") {
    if (
      canFirstApproveLeave({
        viewerRole: opts.viewerRole,
        viewerDepartment: opts.viewerDepartment,
        applicantDepartment: opts.applicantDepartment,
      }) &&
      !applicantSkipsTeamLeadLeaveStep(opts.applicantRole)
    ) {
      return true;
    }
    if (canCsCenterChiefFinalApproveLeave({ ...opts, status: "PENDING" })) return true;
    if (exec && canExecutiveFinalApproveLeave({ ...opts, status: "PENDING" })) return true;
    return false;
  }

  if (from === "TEAM_LEAD_APPROVED" || from === "APPROVED") {
    if (canCsCenterChiefFinalApproveLeave({ ...opts, status: "TEAM_LEAD_APPROVED" })) return true;
    if (exec && canExecutiveFinalApproveLeave({ ...opts, status: "TEAM_LEAD_APPROVED" })) return true;
    return false;
  }

  return false;
}
