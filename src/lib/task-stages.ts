import "server-only";

import type { Prisma, TaskStageStatus, TaskStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { appendWorkLogOnceForTaskStatus } from "@/lib/activity-log";
import { todayYmdKst } from "@/lib/date-kst";
import { createNotificationWithOptions } from "@/lib/notifications";
import { findProjectFolderUrl, PROJECT_FOLDER_MARKER } from "@/lib/project-folder";

/**
 * 프로젝트(업무 화면의 최상위 Task) 단계 진행.
 *
 * 규칙
 * - 단계는 순서대로 진행한다. 한 번에 하나의 단계만 ACTIVE.
 * - 단계 담당자는 맡은 단계마다 "완료"를 누른다. 단계 담당자 전원이 완료하면 그 단계는 DONE이 되고
 *   다음 단계가 ACTIVE로 바뀌며 다음 단계 담당자에게 알림이 간다.
 * - "저장"은 진행 메모와 진행률(%)을 기록한다(TaskStageProgress). 단계 상태는 바뀌지 않는다.
 * - 단계 구성(이름·순서·담당자)은 관리자·프로젝트 작성자·프로젝트 담당자가 바꾼다.
 */

export const MAX_STAGES = 30;
export const MAX_STAGE_NAME = 60;
export const MAX_PROGRESS_NOTE = 2000;

export class StageError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export type StageViewer = { id: string; role?: string | null };

export function isStageAdmin(viewer: StageViewer): boolean {
  return viewer.role === "EXECUTIVE" || viewer.role === "ADMIN";
}

const taskAccessSelect = {
  id: true,
  title: true,
  scope: true,
  deletedAt: true,
  createdById: true,
  assignedToId: true,
  assignees: { select: { userId: true } },
} satisfies Prisma.TaskSelect;

type TaskAccessRow = Prisma.TaskGetPayload<{ select: typeof taskAccessSelect }>;

function isTaskMember(task: TaskAccessRow, userId: string): boolean {
  return (
    task.createdById === userId ||
    task.assignedToId === userId ||
    task.assignees.some((a) => a.userId === userId)
  );
}

export function canEditStages(viewer: StageViewer, task: TaskAccessRow): boolean {
  return isStageAdmin(viewer) || isTaskMember(task, viewer.id);
}

/** 단계 조회 대상(업무 목록과 같은 기준 + 단계 담당자)에 대한 Task where */
export function visibleTaskWhere(viewer: StageViewer): Prisma.TaskWhereInput {
  const base: Prisma.TaskWhereInput = { deletedAt: null, scope: "TEAM", stages: { some: {} } };
  if (isStageAdmin(viewer)) return base;
  return {
    ...base,
    OR: [
      { createdById: viewer.id },
      { assignedToId: viewer.id },
      { assignees: { some: { userId: viewer.id } } },
      { stages: { some: { assignees: { some: { userId: viewer.id } } } } },
    ],
  };
}

async function loadTaskForStages(taskId: string): Promise<TaskAccessRow> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  if (!task || task.deletedAt) throw new StageError(404, "존재하지 않거나 삭제된 프로젝트입니다.");
  if (task.scope !== "TEAM") throw new StageError(400, "단계는 회사(팀) 프로젝트에서만 쓸 수 있습니다.");
  return task;
}

const userBrief = { select: { id: true, name: true, position: true, department: true } } as const;

const stageInclude = {
  assignees: { include: { user: userBrief }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.TaskStageInclude;

export type StageWithAssignees = Prisma.TaskStageGetPayload<{ include: typeof stageInclude }>;

export function serializeStage(stage: StageWithAssignees, index: number) {
  const done = stage.assignees.filter((a) => a.completedAt).length;
  const progress =
    stage.status === "DONE"
      ? 100
      : stage.assignees.length === 0
        ? 0
        : Math.round(
            stage.assignees.reduce((sum, a) => sum + (a.completedAt ? 100 : a.progress), 0) /
              stage.assignees.length
          );
  return {
    id: stage.id,
    number: index + 1,
    name: stage.name,
    status: stage.status,
    startedAt: stage.startedAt?.toISOString() ?? null,
    completedAt: stage.completedAt?.toISOString() ?? null,
    progress,
    doneCount: done,
    assignees: stage.assignees.map((a) => ({
      userId: a.userId,
      name: a.user.name,
      position: a.user.position,
      department: a.user.department,
      progress: a.completedAt ? 100 : a.progress,
      lastNote: a.lastNote,
      lastSavedAt: a.lastSavedAt?.toISOString() ?? null,
      completedAt: a.completedAt?.toISOString() ?? null,
    })),
  };
}

export type SerializedStage = ReturnType<typeof serializeStage>;

/** 프로젝트 전체 진행률: 완료 단계 + 진행 중 단계의 평균 진행률 */
export function overallProgress(stages: SerializedStage[]): number {
  if (stages.length === 0) return 0;
  return Math.round(stages.reduce((sum, s) => sum + s.progress, 0) / stages.length);
}

async function loadStages(taskId: string, tx: Prisma.TransactionClient = prisma) {
  return tx.taskStage.findMany({
    where: { taskId },
    include: stageInclude,
    orderBy: { orderIndex: "asc" },
  });
}

/**
 * 단계 상태를 규칙에 맞게 정리한다.
 * 앞에서부터 담당자 전원이 완료한 단계는 DONE, 처음 남은 단계는 ACTIVE, 나머지는 PENDING.
 * 새로 ACTIVE가 된 단계 id 목록과 전체 완료 여부를 돌려준다.
 */
async function normalizeStages(tx: Prisma.TransactionClient, taskId: string) {
  const stages = await tx.taskStage.findMany({
    where: { taskId },
    include: { assignees: { select: { completedAt: true } } },
    orderBy: { orderIndex: "asc" },
  });
  const now = new Date();
  const started: string[] = [];
  let activeFound = false;

  for (const s of stages) {
    let next: TaskStageStatus;
    if (activeFound) {
      next = "PENDING";
    } else if (s.assignees.length > 0 && s.assignees.every((a) => a.completedAt)) {
      next = "DONE";
    } else {
      next = "ACTIVE";
      activeFound = true;
    }
    if (next === s.status) continue;
    await tx.taskStage.update({
      where: { id: s.id },
      data: {
        status: next,
        startedAt: next === "PENDING" ? null : (s.startedAt ?? now),
        completedAt: next === "DONE" ? now : null,
      },
    });
    if (next === "ACTIVE") started.push(s.id);
  }
  const allDone = stages.length > 0 && !activeFound;
  return { started, allDone, wasAllDone: stages.length > 0 && stages.every((s) => s.status === "DONE") };
}

/**
 * 프로젝트 상태를 단계 진행에 맞춘다.
 * 진행 중인 단계가 있으면 IN_PROGRESS(진행중), 모든 단계가 끝나면 DONE(완료).
 * 단계가 없으면 건드리지 않는다(기존처럼 사람이 상태를 바꿈).
 */
async function syncTaskStatusWithStages(taskId: string, actorId: string) {
  const [task, stages] = await Promise.all([
    prisma.task.findUnique({ where: { id: taskId }, select: { id: true, title: true, status: true } }),
    prisma.taskStage.findMany({ where: { taskId }, select: { status: true } }),
  ]);
  if (!task || stages.length === 0) return;
  const next: TaskStatus = stages.every((s) => s.status === "DONE") ? "DONE" : "IN_PROGRESS";
  if (task.status === next) return;

  await prisma.task.update({
    where: { id: taskId },
    data:
      next === "DONE"
        ? { status: "DONE", isCompleted: true, completedAt: new Date() }
        : { status: "IN_PROGRESS", isCompleted: false, ...(task.status === "DONE" ? { completedAt: null, archivedAt: null } : {}) },
  });
  // 업무 화면에서 상태를 바꿀 때와 같이 최초 단계 이동을 업무일지에 남긴다
  void appendWorkLogOnceForTaskStatus({
    userId: actorId,
    dateStr: todayYmdKst(),
    taskId,
    taskTitle: task.title,
    status: next,
  }).catch((e) => console.error("[task-stages] work-log skipped:", e));
}

async function notifyStageStarted(taskId: string, taskTitle: string, stageIds: string[], actorId: string) {
  if (stageIds.length === 0) return;
  const stages = await loadStages(taskId);
  for (const [i, s] of stages.entries()) {
    if (!stageIds.includes(s.id)) continue;
    await Promise.allSettled(
      // 단계를 시작시킨 본인(완료를 누른 사람·단계를 만든 사람)은 화면에서 이미 보고 있으므로 제외
      s.assignees.filter((a) => a.userId !== actorId).map((a) =>
        createNotificationWithOptions({
          userId: a.userId,
          type: "ASSIGNED",
          message: `'${taskTitle}' 프로젝트의 ${i + 1}단계(${s.name})가 시작되었습니다. 맡은 일을 확인해 주세요.`,
          link: "/stages/me",
          actorId,
          pushTitle: "단계 시작",
        })
      )
    );
  }
}

async function notifyAllDone(task: TaskAccessRow, actorId: string) {
  const targets = new Set<string>();
  if (task.createdById) targets.add(task.createdById);
  task.assignees.forEach((a) => targets.add(a.userId));
  targets.delete(actorId);
  await Promise.allSettled(
    [...targets].map((userId) =>
      createNotificationWithOptions({
        userId,
        type: "ASSIGNED",
        message: `'${task.title}' 프로젝트의 모든 단계가 완료되었습니다.`,
        link: `/tasks/${task.id}`,
        actorId,
        pushTitle: "프로젝트 단계 완료",
      })
    )
  );
}

async function notifyAddedToActiveStage(
  taskTitle: string,
  stage: { number: number; name: string },
  userIds: string[],
  actorId: string
) {
  await Promise.allSettled(
    userIds
      .filter((id) => id !== actorId)
      .map((userId) =>
        createNotificationWithOptions({
          userId,
          type: "ASSIGNED",
          message: `'${taskTitle}' 프로젝트의 ${stage.number}단계(${stage.name}) 담당자로 지정되었습니다. 지금 진행 중인 단계입니다.`,
          link: "/stages/me",
          actorId,
          pushTitle: "단계 담당 지정",
        })
      )
  );
}

export async function getTaskStages(taskId: string, viewer: StageViewer) {
  const task = await loadTaskForStages(taskId);
  const stages = await loadStages(taskId);
  const isStageAssignee = stages.some((s) => s.assignees.some((a) => a.userId === viewer.id));
  if (!canEditStages(viewer, task) && !isStageAssignee) {
    throw new StageError(403, "이 프로젝트의 단계를 볼 권한이 없습니다.");
  }
  const serialized = stages.map(serializeStage);
  return {
    taskId: task.id,
    taskTitle: task.title,
    canEdit: canEditStages(viewer, task),
    overallProgress: overallProgress(serialized),
    stages: serialized,
  };
}

export type StageInput = { id?: string | null; name: string; assigneeIds: string[] };

/** 단계 구성 저장(전체 교체). 완료된 단계는 이름만 바꿀 수 있고 맨 앞 순서를 유지해야 한다 */
export async function replaceTaskStages(taskId: string, viewer: StageViewer, input: StageInput[]) {
  const task = await loadTaskForStages(taskId);
  if (!canEditStages(viewer, task)) {
    throw new StageError(403, "단계를 수정할 권한이 없습니다. 프로젝트 작성자·담당자·관리자만 수정할 수 있습니다.");
  }
  if (!Array.isArray(input) || input.length > MAX_STAGES) {
    throw new StageError(400, `단계는 최대 ${MAX_STAGES}개까지 만들 수 있습니다.`);
  }

  const cleaned = input.map((s, i) => {
    const name = String(s?.name ?? "").trim();
    if (!name) throw new StageError(400, `${i + 1}단계 이름을 입력해 주세요.`);
    if (name.length > MAX_STAGE_NAME) throw new StageError(400, `${i + 1}단계 이름이 너무 깁니다.`);
    const assigneeIds = [...new Set((Array.isArray(s?.assigneeIds) ? s.assigneeIds : []).map(String))];
    if (assigneeIds.length === 0) throw new StageError(400, `${i + 1}단계 「${name}」에 담당자를 한 명 이상 지정해 주세요.`);
    return { id: s?.id ? String(s.id) : null, name, assigneeIds };
  });

  const allUserIds = [...new Set(cleaned.flatMap((s) => s.assigneeIds))];
  const existingUsers = await prisma.user.findMany({ where: { id: { in: allUserIds } }, select: { id: true } });
  if (existingUsers.length !== allUserIds.length) throw new StageError(400, "존재하지 않는 직원이 담당자에 들어 있습니다.");

  const before = await loadStages(taskId);
  const beforeById = new Map(before.map((s) => [s.id, s]));
  for (const s of cleaned) {
    if (s.id && !beforeById.has(s.id)) throw new StageError(400, "다른 프로젝트의 단계가 섞여 있습니다. 새로고침 후 다시 시도해 주세요.");
  }

  // 완료된 단계는 삭제·순서 변경·담당자 변경 불가(기록 보존)
  const doneBefore = before.filter((s) => s.status === "DONE");
  for (const [i, d] of doneBefore.entries()) {
    const at = cleaned.findIndex((s) => s.id === d.id);
    if (at === -1) throw new StageError(400, `완료된 단계 「${d.name}」는 삭제할 수 없습니다.`);
    if (at !== i) throw new StageError(400, "완료된 단계의 순서는 바꿀 수 없습니다.");
    const prevIds = d.assignees.map((a) => a.userId).sort().join(",");
    if ([...cleaned[at].assigneeIds].sort().join(",") !== prevIds) {
      throw new StageError(400, `완료된 단계 「${d.name}」의 담당자는 바꿀 수 없습니다.`);
    }
  }

  const activeBefore = before.find((s) => s.status === "ACTIVE");
  const activeBeforeAssignees = new Set(activeBefore?.assignees.map((a) => a.userId) ?? []);

  const result = await prisma.$transaction(async (tx) => {
    const keepIds = cleaned.map((s) => s.id).filter((id): id is string => Boolean(id));
    await tx.taskStage.deleteMany({ where: { taskId, id: { notIn: keepIds } } });

    for (const [orderIndex, s] of cleaned.entries()) {
      let stageId = s.id;
      if (stageId) {
        await tx.taskStage.update({ where: { id: stageId }, data: { name: s.name, orderIndex } });
        await tx.taskStageAssignee.deleteMany({ where: { stageId, userId: { notIn: s.assigneeIds } } });
      } else {
        const created = await tx.taskStage.create({ data: { taskId, name: s.name, orderIndex } });
        stageId = created.id;
      }
      await tx.taskStageAssignee.createMany({
        data: s.assigneeIds.map((userId) => ({ stageId: stageId!, userId })),
        skipDuplicates: true,
      });
    }

    // 단계 담당자가 프로젝트 상세를 열 수 있도록 프로젝트 담당자에도 넣는다
    await tx.taskAssignee.createMany({
      data: allUserIds.map((userId) => ({ taskId, userId })),
      skipDuplicates: true,
    });

    return normalizeStages(tx, taskId);
  });

  await syncTaskStatusWithStages(taskId, viewer.id);
  const after = await loadStages(taskId);
  await notifyStageStarted(taskId, task.title, result.started, viewer.id);

  // 이미 진행 중이던 단계에 새로 추가된 담당자에게도 알린다
  const activeAfterIndex = after.findIndex((s) => s.status === "ACTIVE");
  const activeAfter = after[activeAfterIndex];
  if (activeAfter && activeBefore && activeAfter.id === activeBefore.id && !result.started.includes(activeAfter.id)) {
    const added = activeAfter.assignees.map((a) => a.userId).filter((id) => !activeBeforeAssignees.has(id));
    if (added.length > 0) {
      await notifyAddedToActiveStage(task.title, { number: activeAfterIndex + 1, name: activeAfter.name }, added, viewer.id);
    }
  }
  if (result.allDone && !result.wasAllDone) await notifyAllDone(task, viewer.id);

  return getTaskStages(taskId, viewer);
}

async function loadMyActiveAssignment(stageId: string, userId: string) {
  const row = await prisma.taskStageAssignee.findUnique({
    where: { stageId_userId: { stageId, userId } },
    include: { stage: { select: { id: true, status: true, taskId: true, name: true } } },
  });
  if (!row) throw new StageError(403, "이 단계의 담당자가 아닙니다.");
  if (row.stage.status === "PENDING") throw new StageError(400, "아직 시작되지 않은 단계입니다. 앞 단계가 끝나면 시작됩니다.");
  if (row.stage.status === "DONE") throw new StageError(400, "이미 완료된 단계입니다.");
  return row;
}

/** 담당자 완료 처리(또는 취소). 단계 담당자 전원이 완료하면 다음 단계가 시작된다 */
export async function setMyStageCompleted(stageId: string, viewer: StageViewer, completed: boolean) {
  const row = await loadMyActiveAssignment(stageId, viewer.id);
  const task = await loadTaskForStages(row.stage.taskId);
  if (completed && row.completedAt) throw new StageError(400, "이미 완료 처리했습니다.");
  if (!completed && !row.completedAt) throw new StageError(400, "완료 처리하지 않은 단계입니다.");

  const result = await prisma.$transaction(async (tx) => {
    await tx.taskStageAssignee.update({
      where: { id: row.id },
      data: completed
        ? { completedAt: new Date(), progress: 100 }
        : { completedAt: null },
    });
    return normalizeStages(tx, row.stage.taskId);
  });

  await syncTaskStatusWithStages(task.id, viewer.id);
  await notifyStageStarted(task.id, task.title, result.started, viewer.id);
  if (result.allDone && !result.wasAllDone) await notifyAllDone(task, viewer.id);
  return { stageAdvanced: result.started.length > 0 || result.allDone, allDone: result.allDone };
}

/** 저장 버튼: 진행 메모와 진행률 기록 */
export async function saveMyStageProgress(stageId: string, viewer: StageViewer, noteRaw: unknown, progressRaw: unknown) {
  const row = await loadMyActiveAssignment(stageId, viewer.id);
  if (row.completedAt) throw new StageError(400, "완료 처리한 단계입니다. 수정하려면 먼저 완료를 취소해 주세요.");
  const note = String(noteRaw ?? "").trim();
  if (!note) throw new StageError(400, "진행 내용을 입력해 주세요.");
  if (note.length > MAX_PROGRESS_NOTE) throw new StageError(400, `진행 내용은 ${MAX_PROGRESS_NOTE}자까지 쓸 수 있습니다.`);
  const progress = Math.round(Number(progressRaw));
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    throw new StageError(400, "진행률은 0~100 사이로 입력해 주세요.");
  }
  const now = new Date();
  await prisma.$transaction([
    prisma.taskStageProgress.create({ data: { stageId, userId: viewer.id, note, progress } }),
    prisma.taskStageAssignee.update({
      where: { id: row.id },
      data: { progress, lastNote: note, lastSavedAt: now },
    }),
  ]);
}

/** 단계별 진행 기록(최근순) */
export async function getStageProgressLogs(stageId: string, viewer: StageViewer) {
  const stage = await prisma.taskStage.findUnique({ where: { id: stageId }, select: { taskId: true } });
  if (!stage) throw new StageError(404, "단계를 찾을 수 없습니다.");
  await getTaskStages(stage.taskId, viewer); // 권한 확인
  const logs = await prisma.taskStageProgress.findMany({
    where: { stageId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { id: true, name: true } } },
  });
  return logs.map((l) => ({
    id: l.id,
    userId: l.userId,
    userName: l.user.name,
    note: l.note,
    progress: l.progress,
    createdAt: l.createdAt.toISOString(),
  }));
}

/** 전체 진행 현황: 단계가 있는 프로젝트 목록 */
export async function getStageOverview(viewer: StageViewer, includeDone: boolean) {
  const tasks = await prisma.task.findMany({
    where: {
      ...visibleTaskWhere(viewer),
      ...(includeDone ? {} : { stages: { some: { status: { not: "DONE" } } } }),
    },
    select: {
      id: true,
      title: true,
      dueDate: true,
      createdBy: { select: { id: true, name: true } },
      attachments: { where: { deletedAt: null, url: { contains: PROJECT_FOLDER_MARKER } }, select: { url: true }, take: 1 },
      stages: { include: stageInclude, orderBy: { orderIndex: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return tasks.map((t) => {
    const stages = t.stages.map(serializeStage);
    const active = stages.find((s) => s.status === "ACTIVE") ?? null;
    return {
      taskId: t.id,
      title: t.title,
      dueDate: t.dueDate?.toISOString() ?? null,
      createdBy: t.createdBy,
      folderUrl: findProjectFolderUrl(t.attachments),
      overallProgress: overallProgress(stages),
      allDone: stages.length > 0 && stages.every((s) => s.status === "DONE"),
      activeStageNumber: active?.number ?? null,
      stages,
    };
  });
}

/** 담당자 페이지: 한 직원이 맡은 단계 목록. 보는 사람이 볼 수 있는 프로젝트만 */
export async function getAssigneeStages(targetUserId: string, viewer: StageViewer) {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, position: true, department: true },
  });
  if (!user) throw new StageError(404, "직원을 찾을 수 없습니다.");

  const rows = await prisma.taskStageAssignee.findMany({
    where: {
      userId: targetUserId,
      stage: { task: targetUserId === viewer.id ? { deletedAt: null, scope: "TEAM" } : visibleTaskWhere(viewer) },
    },
    include: {
      stage: {
        include: {
          ...stageInclude,
          task: {
            select: {
              id: true,
              title: true,
              dueDate: true,
              attachments: { where: { deletedAt: null, url: { contains: PROJECT_FOLDER_MARKER } }, select: { url: true }, take: 1 },
              stages: { select: { id: true }, orderBy: { orderIndex: "asc" } },
            },
          },
        },
      },
    },
  });

  const items = rows.map((r) => {
    const index = r.stage.task.stages.findIndex((s) => s.id === r.stageId);
    return {
      task: {
        id: r.stage.task.id,
        title: r.stage.task.title,
        dueDate: r.stage.task.dueDate?.toISOString() ?? null,
        folderUrl: findProjectFolderUrl(r.stage.task.attachments),
      },
      totalStages: r.stage.task.stages.length,
      stage: serializeStage(r.stage, index),
      mine: {
        progress: r.completedAt ? 100 : r.progress,
        lastNote: r.lastNote,
        lastSavedAt: r.lastSavedAt?.toISOString() ?? null,
        completedAt: r.completedAt?.toISOString() ?? null,
      },
    };
  });

  const byStatus = (st: TaskStageStatus) => items.filter((i) => i.stage.status === st);
  const sortByTask = <T extends { task: { title: string }; stage: { number: number } }>(list: T[]) =>
    list.sort((a, b) => a.task.title.localeCompare(b.task.title, "ko") || a.stage.number - b.stage.number);

  return {
    user,
    isMe: targetUserId === viewer.id,
    active: sortByTask(byStatus("ACTIVE")),
    pending: sortByTask(byStatus("PENDING")),
    done: sortByTask(byStatus("DONE")).slice(0, 50),
  };
}

export async function listStageTemplates() {
  const rows = await prisma.taskStageTemplate.findMany({ orderBy: { name: "asc" } });
  return rows.map((r) => ({ id: r.id, name: r.name, stageNames: r.stageNames, createdById: r.createdById }));
}

/** 같은 이름이면 덮어쓴다 */
export async function saveStageTemplate(viewer: StageViewer, nameRaw: unknown, stageNamesRaw: unknown) {
  const name = String(nameRaw ?? "").trim();
  if (!name || name.length > MAX_STAGE_NAME) throw new StageError(400, "템플릿 이름을 확인해 주세요.");
  const stageNames = (Array.isArray(stageNamesRaw) ? stageNamesRaw : [])
    .map((s) => String(s ?? "").trim())
    .filter(Boolean);
  if (stageNames.length === 0) throw new StageError(400, "템플릿에 넣을 단계가 없습니다.");
  if (stageNames.length > MAX_STAGES || stageNames.some((s) => s.length > MAX_STAGE_NAME)) {
    throw new StageError(400, "단계 수나 단계 이름 길이를 확인해 주세요.");
  }
  const existing = await prisma.taskStageTemplate.findUnique({ where: { name } });
  if (existing && existing.createdById !== viewer.id && !isStageAdmin(viewer)) {
    throw new StageError(403, "다른 사람이 만든 같은 이름의 템플릿이 있습니다. 다른 이름을 써 주세요.");
  }
  await prisma.taskStageTemplate.upsert({
    where: { name },
    create: { name, stageNames, createdById: viewer.id },
    update: { stageNames },
  });
}

export async function deleteStageTemplate(viewer: StageViewer, id: string) {
  const row = await prisma.taskStageTemplate.findUnique({ where: { id } });
  if (!row) throw new StageError(404, "템플릿을 찾을 수 없습니다.");
  if (row.createdById !== viewer.id && !isStageAdmin(viewer)) {
    throw new StageError(403, "만든 사람이나 관리자만 삭제할 수 있습니다.");
  }
  await prisma.taskStageTemplate.delete({ where: { id } });
}
