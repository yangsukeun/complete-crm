import { isCsOrgDepartment } from "@/lib/org-access";
import { isExecutiveOrAdmin } from "@/lib/role-access";
import type { Prisma } from "@prisma/client";

export type ScheduleViewer = {
  id: string;
  role: string | null | undefined;
  department: string | null | undefined;
};

export type UserDeptRow = {
  id: string;
  department: string | null;
  role?: string | null;
};

/** CS 스케줄 풀 구성원: CS 부서이며 대표/관리자가 아님 */
export function isCsSchedulerMember(opts: {
  department: string | null | undefined;
  role?: string | null | undefined;
}): boolean {
  if (isExecutiveOrAdmin(opts.role)) return false;
  return isCsOrgDepartment(opts.department);
}

export function csUserIdsFrom(users: UserDeptRow[]): string[] {
  return users.filter((u) => isCsSchedulerMember(u)).map((u) => u.id);
}

/** TEAM 캘린더 목록 필터. CS는 CS 작성분만, 본사(관리자 포함)는 CS 작성분 제외. */
export function teamScheduleWhere(viewer: ScheduleViewer, csUserIds: string[]): Prisma.ScheduleWhereInput {
  if (isCsSchedulerMember(viewer)) {
    const ids = csUserIds.length > 0 ? csUserIds : [viewer.id];
    return { scope: "TEAM", userId: { in: ids } };
  }
  if (isExecutiveOrAdmin(viewer.role)) {
    if (csUserIds.length === 0) return { scope: "TEAM" };
    return { scope: "TEAM", userId: { notIn: csUserIds } };
  }
  return { scope: "TEAM", userId: viewer.id };
}

export function canViewSchedule(opts: {
  viewer: ScheduleViewer;
  scheduleUserId: string;
  scheduleScope: string;
  ownerIsCsScheduler: boolean;
}): boolean {
  if (opts.scheduleUserId === opts.viewer.id) return true;
  if (opts.scheduleScope !== "TEAM") return false;
  const viewerCs = isCsSchedulerMember(opts.viewer);
  if (opts.ownerIsCsScheduler) return viewerCs;
  if (isExecutiveOrAdmin(opts.viewer.role)) return true;
  return false;
}

export function canMutateSchedule(opts: {
  viewer: ScheduleViewer;
  scheduleUserId: string;
  ownerIsCsScheduler: boolean;
}): boolean {
  if (opts.scheduleUserId === opts.viewer.id) return true;
  if (isExecutiveOrAdmin(opts.viewer.role) && !opts.ownerIsCsScheduler) return true;
  return false;
}

/** CS는 CS만, 그 외는 CS가 아닌 직원만 초대 */
export function filterScheduleInviteeIds(
  viewer: ScheduleViewer,
  inviteeIds: string[],
  csUserIds: string[],
): string[] {
  const cs = new Set(csUserIds);
  if (isCsSchedulerMember(viewer)) {
    return inviteeIds.filter((id) => cs.has(id));
  }
  return inviteeIds.filter((id) => !cs.has(id));
}

/** CS 풀끼리, 본사 풀끼리만 일정 공유 */
export function sameScheduleSharePool(userIdA: string, userIdB: string, csUserIds: string[]): boolean {
  const cs = new Set(csUserIds);
  return cs.has(userIdA) === cs.has(userIdB);
}
