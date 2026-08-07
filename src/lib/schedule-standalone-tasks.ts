import type { Prisma } from "@prisma/client";
import { TaskCreationSource, TaskStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { taskVisibilityMemberOr } from "@/lib/task-assignees";
import type { WorkspaceScope } from "@/lib/workspace";

const MAX_PROJECT_NAMES_FOR_TITLE_EXCLUDE = 500;

/**
 * 스케줄 전용: `Task.projectId`가 비어 있어도 제목이 팀에서 보이는 프로젝트명과 같으면
 * (대소문자·앞뒤 공백 무시) CRM 프로젝트와 동일 명칭으로 취급해 목록에서 제외한다.
 */
export async function taskWhereExcludeTitleMatchingVisibleProject(sessionUser: {
  id: string;
  email?: string | null;
  role?: string | null;
}): Promise<Prisma.TaskWhereInput> {
  const masterEmail = (process.env.MASTER_EMAIL ?? "admin@complete.co.kr").trim().toLowerCase();
  const isMaster = String(sessionUser.email ?? "").trim().toLowerCase() === masterEmail;
  const isAdmin = sessionUser.role === "EXECUTIVE" || sessionUser.role === "ADMIN";
  const memberFilter = isAdmin || isMaster ? {} : { users: { some: { id: sessionUser.id } } };

  const projects = await prisma.project.findMany({
    where: { deletedAt: null, ...memberFilter },
    select: { name: true },
  });
  const byLower = new Map<string, string>();
  for (const p of projects) {
    const trimmed = p.name.trim();
    if (!trimmed) continue;
    const k = trimmed.toLowerCase();
    if (!byLower.has(k)) byLower.set(k, trimmed);
  }
  const names = [...byLower.values()].slice(0, MAX_PROJECT_NAMES_FOR_TITLE_EXCLUDE);
  if (names.length === 0) return {};

  return {
    NOT: {
      OR: names.map((name) => ({
        title: { equals: name, mode: "insensitive" as const },
      })),
    },
  };
}

/** `/schedule` 할일 목록과 동일: SCHEDULE|UNKNOWN + projectId null + 프로젝트명 제목 제외 */
export async function buildScheduleStandaloneTaskWhere(
  sessionUser: { id: string; email?: string | null; role?: string | null },
  scope: WorkspaceScope
): Promise<Prisma.TaskWhereInput> {
  const isAdmin = sessionUser.role === "EXECUTIVE" || sessionUser.role === "ADMIN";
  const visibilityWhere: Prisma.TaskWhereInput =
    scope === "PERSONAL"
      ? { scope: "PERSONAL", OR: taskVisibilityMemberOr(sessionUser.id) }
      : { scope: "TEAM", ...(isAdmin ? {} : { OR: taskVisibilityMemberOr(sessionUser.id) }) };

  const titleExclude = await taskWhereExcludeTitleMatchingVisibleProject(sessionUser);

  return {
    deletedAt: null,
    archivedAt: null,
    projectId: null,
    status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
    isCompleted: false,
    creationSource: { in: [TaskCreationSource.SCHEDULE, TaskCreationSource.UNKNOWN] },
    ...visibilityWhere,
    ...titleExclude,
  };
}

export type ScheduleStandaloneTaskRow = {
  id: string;
  title: string;
  dueDate: Date | null;
  isCompleted: boolean;
  assignedTo: { id: string; name: string; position: string | null } | null;
  assignees: { user: { id: string; name: string; position: string | null } }[];
};

export async function listScheduleStandaloneTasks(
  sessionUser: { id: string; email?: string | null; role?: string | null },
  scope: WorkspaceScope,
  take = 100
): Promise<ScheduleStandaloneTaskRow[]> {
  const where = await buildScheduleStandaloneTaskWhere(sessionUser, scope);
  return prisma.task.findMany({
    where,
    orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
    take,
    select: {
      id: true,
      title: true,
      dueDate: true,
      isCompleted: true,
      assignedTo: { select: { id: true, name: true, position: true } },
      assignees: {
        select: { user: { select: { id: true, name: true, position: true } } },
      },
    },
  });
}
