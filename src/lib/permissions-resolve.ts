import "server-only";
import prisma from "@/lib/prisma";
import { getDefaultPermissionsForRole, parsePermissions, type RoleName } from "@/lib/permissions";
import { getCsTeamDefaultPermissions, isCsTeamDepartment } from "@/lib/cs-team-permissions";
import { getLogisticsDefaultPermissions, isCsOrgDepartment, isLogisticsOrgDepartment } from "@/lib/org-access";
import { isManagementManagerPosition } from "@/lib/employee-admin-access";

/**
 * 로그인·세션 갱신용: JWT에 넣을 기능 권한 JSON 문자열.
 * - User.permissions가 유효한 JSON 배열이면 그대로 사용(개별 지정, 빈 배열 포함).
 * - 없으면 User.position 이름과 일치하는 Position.permissions 적용.
 * - CS팀(USER/TEAM_LEAD/CENTER_CHIEF)이면 역할 기본에서 tasks/quotations 제외한 목록을 명시 반환.
 * - 그것도 없으면 null → 클라이언트는 역할(role) 기본 권한 사용.
 */
export async function resolveEffectivePermissionsJson(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { permissions: true, position: true, role: true, department: true },
  });
  if (!user) return null;

  const userParsed = parsePermissions(user.permissions);
  const posName = user.position?.trim();
  let posParsed: string[] | null = null;
  if (posName) {
    const posRow = await prisma.position.findFirst({
      where: { name: posName },
      select: { permissions: true },
    });
    posParsed = parsePermissions(posRow?.permissions ?? null);
  }

  // 경영관리 매니저: 직원 관리를 대표와 같이 쓸 수 있게 admin_employees 항상 포함
  if (isManagementManagerPosition(user.position)) {
    const r = String(user.role ?? "USER").toUpperCase() as RoleName;
    const base = userParsed ?? posParsed ?? getDefaultPermissionsForRole(r);
    const list = base.includes("admin_employees") ? base : [...base, "admin_employees"];
    return JSON.stringify(list);
  }

  if (userParsed !== null) return JSON.stringify(userParsed);
  if (posParsed !== null) return JSON.stringify(posParsed);

  // CS센터: 세션에 명시 JSON을 넣어 프로젝트·게시판 등 숨김
  if (isCsOrgDepartment(user.department) || isCsTeamDepartment(user.department)) {
    const role = String(user.role ?? "USER").toUpperCase();
    if (role === "USER" || role === "TEAM_LEAD" || role === "CENTER_CHIEF") {
      return JSON.stringify(getCsTeamDefaultPermissions(role));
    }
  }

  if (isLogisticsOrgDepartment(user.department)) {
    const role = String(user.role ?? "USER").toUpperCase();
    if (role === "USER" || role === "TEAM_LEAD" || role === "CENTER_CHIEF") {
      return JSON.stringify(getLogisticsDefaultPermissions(role));
    }
  }

  return null;
}
