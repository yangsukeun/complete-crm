import type { Prisma } from "@prisma/client";

/** 목록/상세 API용: 담당자 배열 + 첫 담당자(레거시 assignedTo) */
export type TaskAssigneeUser = {
  id: string;
  name: string;
  email: string;
  position?: string | null;
  image?: string | null;
};

export const taskAssigneeUserSelect = {
  id: true,
  name: true,
  email: true,
  position: true,
  image: true,
} as const;

export const taskListAssigneesInclude = {
  assignees: {
    select: {
      user: { select: taskAssigneeUserSelect },
    },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

export function normalizeAssigneeIds(
  assigneeIds: string[] | undefined,
  assignedToId: string | undefined,
  fallbackUserId: string
): string[] {
  let ids = assigneeIds?.filter(Boolean) ?? [];
  if (ids.length === 0 && assignedToId) ids = [assignedToId];
  if (ids.length === 0) ids = [fallbackUserId];
  return [...new Set(ids)];
}

export function serializeAssigneesFromRows(
  rows: { user?: TaskAssigneeUser | null }[] | null | undefined,
  legacyAssigned: TaskAssigneeUser | null | undefined
): { assignees: TaskAssigneeUser[]; assignedTo: TaskAssigneeUser | null } {
  const list = rows ?? [];
  const assignees = list.flatMap((r) => (r?.user ? [r.user] : []));
  const assignedTo = assignees[0] ?? legacyAssigned ?? null;
  return { assignees, assignedTo };
}

/** 팀/개인 업무 목록에서 본인에게 보이는 조건 (담당자·다중 담당만; 생성자만이면 목록에 안 보임) */
export function taskVisibilityMemberOr(userId: string): Prisma.TaskWhereInput["OR"] {
  return [
    { deletedAt: null, assignedToId: userId },
    { deletedAt: null, assignees: { some: { userId } } },
  ];
}
