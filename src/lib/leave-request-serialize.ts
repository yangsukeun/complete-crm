import type { Prisma } from "@prisma/client";
import { isCsTeamDepartment } from "@/lib/cs-team-permissions";
import { normalizeDepartment } from "@/lib/leave-department-access";
import { CS_DEPARTMENT_ALIASES, isCsGroup } from "@/lib/cs-tools-access";

/** 팀장·임원·관리자·CS 센터장 — 목록 조회 (팀장·CS센터장은 동일 부서 + 본인 + 타 부서 승인 완료) */
export function isLeaveManagementRole(role: string | undefined): boolean {
  const r = String(role ?? "").toUpperCase();
  return r === "TEAM_LEAD" || r === "CENTER_CHIEF" || r === "EXECUTIVE" || r === "ADMIN";
}

function approvedPeersWhere(viewerDepartment?: string | null): Prisma.LeaveRequestWhereInput {
  const csDepts = [...CS_DEPARTMENT_ALIASES];
  if (isCsGroup(viewerDepartment)) {
    return { status: "APPROVED", user: { department: { in: csDepts } } };
  }
  return { status: "APPROVED", user: { NOT: { department: { in: csDepts } } } };
}

/** 일반 직원: 승인된 건 전사 + 본인 신청 전부(대기·반려 등) */
export function leaveRequestListWhere(
  sessionUserId: string,
  role: string | undefined,
  viewerDepartment?: string | null
): Prisma.LeaveRequestWhereInput {
  const r = String(role ?? "").toUpperCase();
  if (r === "EXECUTIVE" || r === "ADMIN") return {};
  const firstApprover =
    r === "TEAM_LEAD" || (r === "CENTER_CHIEF" && isCsTeamDepartment(viewerDepartment));
  if (firstApprover) {
    const dept = normalizeDepartment(viewerDepartment);
    const or: Prisma.LeaveRequestWhereInput[] = [
      { userId: sessionUserId },
      approvedPeersWhere(viewerDepartment),
    ];
    if (dept) {
      or.push({ user: { department: dept } });
    }
    return { OR: or };
  }
  return {
    OR: [approvedPeersWhere(viewerDepartment), { userId: sessionUserId }],
  };
}

type LeaveUserSelect = {
  id: string;
  name: string;
  email: string;
  department: string | null;
  position: string | null;
  role?: string;
  currentProject: { name: string; brand: { name: string } } | null;
};

/** 동료에게 공개되는 최소 사용자 정보 (이메일·프로젝트 제외) */
export type PublicLeaveUser = {
  id: string;
  name: string;
  department: string | null;
  position: string | null;
};

export type LeaveRequestWithUser = {
  id: string;
  userId: string;
  type: string;
  startDate: Date;
  endDate: Date;
  status: string;
  cancelFromStatus?: string | null;
  reason: string | null;
  createdAt: Date;
  user: LeaveUserSelect | null;
};

export function serializeLeaveRequestForViewer(
  row: LeaveRequestWithUser,
  viewerId: string,
  role: string | undefined
): Omit<LeaveRequestWithUser, "user"> & { user?: LeaveUserSelect | PublicLeaveUser } {
  const mgmt = isLeaveManagementRole(role);
  const owner = row.userId === viewerId;
  const showSensitive = mgmt || owner;

  const base = {
    id: row.id,
    userId: row.userId,
    type: row.type,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    cancelFromStatus: (row as any).cancelFromStatus ?? null,
    createdAt: row.createdAt,
    reason: showSensitive ? row.reason : null,
  };

  if (!row.user) {
    return { ...base };
  }
  if (showSensitive) {
    return { ...base, user: row.user };
  }
  const u: PublicLeaveUser = {
    id: row.user.id,
    name: row.user.name,
    department: row.user.department,
    position: row.user.position,
  };
  return { ...base, user: u };
}

export function leaveDisplayDays(type: string, start: Date, end: Date): number {
  if (type === "HALF_AM" || type === "HALF_PM") return 0.5;
  if (type === "QUARTER_AM" || type === "QUARTER_PM") return 0.25;
  const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return diff;
}
