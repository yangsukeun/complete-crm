import prisma from "@/lib/prisma";

export function normalizeDepartment(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/**
 * 임원·관리자가 아닌 사용자가 타인의 Daily Report를 볼 때: 같은 부서(팀)의 USER·TEAM_LEAD만 허용.
 * (팀장 / admin_logs 권한 직원 공통)
 */
export async function assertCanViewOthersDailyWorkLog(params: {
  viewerId: string;
  viewerRole: string;
  viewerDepartment: string | null | undefined;
  targetUserId: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (params.viewerId === params.targetUserId) return { ok: true };

  const r = params.viewerRole;
  if (r === "EXECUTIVE" || r === "ADMIN") return { ok: true };

  const target = await prisma.user.findUnique({
    where: { id: params.targetUserId },
    select: { id: true, role: true, department: true },
  });
  if (!target) {
    return { ok: false, status: 404, error: "직원을 찾을 수 없습니다." };
  }
  if (target.role === "EXECUTIVE" || target.role === "ADMIN") {
    return { ok: false, status: 403, error: "임원·관리자 일지는 이 메뉴에서 조회할 수 없습니다." };
  }

  const vDept = normalizeDepartment(params.viewerDepartment);
  const tDept = normalizeDepartment(target.department);
  if (!vDept) {
    return {
      ok: false,
      status: 403,
      error:
        "내 계정에 부서가 없으면 팀원 일지를 조회할 수 없습니다. 관리자 화면에서 내 부서를 등록한 뒤 다시 시도하세요.",
    };
  }
  if (vDept !== tDept) {
    return { ok: false, status: 403, error: "같은 부서(팀) 소속 직원의 일지만 조회할 수 있습니다." };
  }
  return { ok: true };
}
