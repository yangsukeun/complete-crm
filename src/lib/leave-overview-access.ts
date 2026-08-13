import { isCsTeamDepartment } from "@/lib/cs-team-permissions";
import { isCsOrgDepartment } from "@/lib/org-access";
import { isExecutiveOrAdmin } from "@/lib/role-access";

/** ADMIN/EXECUTIVE + CS팀 TEAM_LEAD/CENTER_CHIEF */
export function canViewEmployeeLeaveSummary(opts: {
  role: string | null | undefined;
  department: string | null | undefined;
}): boolean {
  if (isExecutiveOrAdmin(opts.role)) return true;
  const r = String(opts.role ?? "").toUpperCase();
  if (r !== "TEAM_LEAD" && r !== "CENTER_CHIEF") return false;
  return isCsTeamDepartment(opts.department);
}

export function canAdjustEmployeeLeave(role: string | null | undefined): boolean {
  return isExecutiveOrAdmin(role);
}

export function leaveSummaryScope(opts: {
  role: string | null | undefined;
  department: string | null | undefined;
}): "all" | "cs" | "none" {
  if (isExecutiveOrAdmin(opts.role)) return "all";
  const r = String(opts.role ?? "").toUpperCase();
  if ((r === "TEAM_LEAD" || r === "CENTER_CHIEF") && isCsTeamDepartment(opts.department)) {
    return "cs";
  }
  return "none";
}

export function isCsLeaveOverviewDepartment(department: string | null | undefined): boolean {
  return isCsTeamDepartment(department) || isCsOrgDepartment(department);
}
