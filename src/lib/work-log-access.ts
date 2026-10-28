import prisma from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import {MARKETING_LOG_REVIEWER,MARKETING_LOG_TARGETS,namedLogReviewer} from './work-log-review-scope';

export function normalizeDepartment(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export type WorkLogViewCaps = {
  staff: boolean;
  lead: boolean;
  otherDept: boolean;
};

function isPrivilegedRole(role: string | null | undefined): boolean {
  const r = String(role ?? "").toUpperCase();
  return r === "EXECUTIVE" || r === "ADMIN";
}

function isLeadBandRole(role: string | null | undefined): boolean {
  const r = String(role ?? "").toUpperCase();
  return r === "TEAM_LEAD" || r === "CENTER_CHIEF";
}

function isStaffBandRole(role: string | null | undefined): boolean {
  return String(role ?? "").toUpperCase() === "USER";
}

/**
 * Daily Report 타인 조회 권한.
 * 같은 부서라도 기본은 못 보고, 사원급·팀장급·다른 부서 키를 병렬로 조합한다.
 * 구 키 admin_logs 는 사원급(같은 부서)과 동일하게 취급.
 */
export function getWorkLogViewCaps(user: {
  role?: string | null;
  permissions?: string | null;
}): WorkLogViewCaps {
  if (isPrivilegedRole(user.role)) {
    return { staff: true, lead: true, otherDept: true };
  }
  const u = { role: String(user.role ?? "USER"), permissions: user.permissions ?? null };
  const legacy = userHasPermission(u, "admin_logs");
  return {
    staff: userHasPermission(u, "work_log_view_staff") || legacy,
    lead: userHasPermission(u, "work_log_view_lead"),
    otherDept: userHasPermission(u, "work_log_view_other_dept"),
  };
}

export function hasDailyReportMenuAccess(user: {
  id?:string; department?:string|null; accountDisabled?:boolean;
  role?: string | null;
  permissions?: string | null;
}): boolean {
  if(user.accountDisabled)return false;
  if(user.id===MARKETING_LOG_REVIEWER)return namedLogReviewer(user);
  if (isPrivilegedRole(user.role)) return true;
  const caps = getWorkLogViewCaps(user);
  return caps.staff || caps.lead;
}

export function canViewOthersDailyWorkLog(params: {
  viewerId: string;
  viewerRole: string;
  viewerDepartment: string | null | undefined;
  viewerPermissions?: string | null;
  target: { id: string; role: string; department?: string | null; accountDisabled?:boolean };
}): boolean {
  if (params.viewerId === params.target.id) return true;
  if(params.viewerId===MARKETING_LOG_REVIEWER)return namedLogReviewer({id:params.viewerId,role:params.viewerRole,department:params.viewerDepartment})&&MARKETING_LOG_TARGETS.has(params.target.id)&&params.target.role==='USER'&&params.target.department?.trim()==='마케팅'&&!params.target.accountDisabled;
  if (isPrivilegedRole(params.viewerRole)) return true;
  if (isPrivilegedRole(params.target.role)) return false;

  const caps = getWorkLogViewCaps({
    role: params.viewerRole,
    permissions: params.viewerPermissions ?? null,
  });

  const targetIsLead = isLeadBandRole(params.target.role);
  const targetIsStaff = isStaffBandRole(params.target.role);
  if (targetIsStaff && !caps.staff) return false;
  if (targetIsLead && !caps.lead) return false;
  if (!targetIsStaff && !targetIsLead) return false;

  const vDept = normalizeDepartment(params.viewerDepartment);
  const tDept = normalizeDepartment(params.target.department);
  const sameDept = vDept.length > 0 && tDept.length > 0 && vDept === tDept;
  if (sameDept) return true;
  return caps.otherDept;
}

/**
 * 임원·관리자가 아닌 사용자가 타인의 Daily Report를 볼 때
 * 사원급 / 팀장급 / 다른 부서 권한을 병렬로 적용한다.
 */
export async function assertCanViewOthersDailyWorkLog(params: {
  viewerId: string;
  viewerRole: string;
  viewerDepartment: string | null | undefined;
  viewerPermissions?: string | null;
  targetUserId: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (params.viewerId === params.targetUserId) return { ok: true };
  if (params.viewerId!==MARKETING_LOG_REVIEWER&&isPrivilegedRole(params.viewerRole)) return { ok: true };

  const target = await prisma.user.findUnique({
    where: { id: params.targetUserId },
    select: { id: true, role: true, department: true, accountDisabled:true },
  });
  if (!target) {
    return { ok: false, status: 404, error: "직원을 찾을 수 없습니다." };
  }

  const allowed = canViewOthersDailyWorkLog({
    viewerId: params.viewerId,
    viewerRole: params.viewerRole,
    viewerDepartment: params.viewerDepartment,
    viewerPermissions: params.viewerPermissions,
    target,
  });
  if (allowed) return { ok: true };

  if (isPrivilegedRole(target.role)) {
    return { ok: false, status: 403, error: "임원·관리자 일지는 이 메뉴에서 조회할 수 없습니다." };
  }

  const caps = getWorkLogViewCaps({
    role: params.viewerRole,
    permissions: params.viewerPermissions ?? null,
  });
  const targetIsLead = isLeadBandRole(target.role);
  if (isStaffBandRole(target.role) && !caps.staff) {
    return { ok: false, status: 403, error: "사원급 Daily Report 조회 권한이 없습니다." };
  }
  if (targetIsLead && !caps.lead) {
    return { ok: false, status: 403, error: "팀장급 Daily Report 조회 권한이 없습니다." };
  }

  const vDept = normalizeDepartment(params.viewerDepartment);
  const tDept = normalizeDepartment(target.department);
  const sameDept = vDept.length > 0 && tDept.length > 0 && vDept === tDept;
  if (!sameDept && !caps.otherDept) {
    return { ok: false, status: 403, error: "다른 부서 Daily Report 조회 권한이 없습니다." };
  }
  return { ok: false, status: 403, error: "이 직원의 Daily Report를 조회할 수 없습니다." };
}
