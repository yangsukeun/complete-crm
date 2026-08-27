import { NextResponse, after } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getServerWorkspaceScopeFromRequest } from "@/lib/workspace";
import { appendWorkLogOnceForTaskStatus, createActivityLog } from "@/lib/activity-log";
import { createNotificationWithOptions, createTaskBodyMentionNotification } from "@/lib/notifications";
import { extractMentionedUserIdsFromTaskDescription } from "@/lib/task-mention-utils";
import { syncTaskMentionsForTask } from "@/lib/task-mention-sync";
import { todayYmdKst } from "@/lib/date-kst";
import { collectDriveImageFileIdsFromTaskDescription } from "@/lib/task-body-drive-images";
import { deleteFile } from "@/lib/storage/google-drive-storage";
import { logAudit, serializeAuditValue } from "@/lib/audit";
import { serializeAssigneesFromRows, taskAssigneeUserSelect } from "@/lib/task-assignees";
import { PROJECT_TASK_COLOR_SET } from "@/lib/project-task-colors";
import { isPrismaTaskColorColumnMissing } from "@/lib/prisma-task-color-fallback";
import type { Prisma } from "@prisma/client";
import { TaskCreationSource } from "@prisma/client";
import { z } from "zod";
import { markGoogleTaskCompleted } from "@/lib/google-tasks-sync";

/** Prisma·DB는 Node 런타임 전제 (Edge에서 cookies/Prisma 이슈 방지) */
export const runtime = "nodejs";

/** TaskRevision·로그용 — 긴 본문 전체를 넣으면 DB/풀러에서 실패할 수 있음 */
const REVISION_BODY_PREVIEW_MAX = 4000;
function revisionBodyPreview(text: string | null | undefined): string | null {
  if (text == null) return null;
  if (text.length <= REVISION_BODY_PREVIEW_MAX) return text;
  return `${text.slice(0, REVISION_BODY_PREVIEW_MAX)}…(+${text.length - REVISION_BODY_PREVIEW_MAX}자)`;
}

function shouldExposeDebugDetails(req: Request, session: any): boolean {
  // 프로덕션에서 무조건 details를 노출하면 위험하므로, 디버그 헤더 + 관리자만 허용
  const header = req.headers.get("x-debug-tasks");
  const okHeader = header === "1" || header === "true";
  const isAdmin = session?.user?.role === "EXECUTIVE" || session?.user?.role === "ADMIN";
  return Boolean(okHeader && isAdmin);
}

/** DB에 Task.dueDate NOT NULL 제약이 남아 있을 때(null 저장) 흔한 Prisma/DB 오류 */
function isTaskDueDateNullConstraintError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { code?: string; message?: string; meta?: { field_name?: string; column?: string } };
  const msg = String(err.message ?? "").toLowerCase();
  const metaField = String(err.meta?.field_name ?? err.meta?.column ?? "").toLowerCase();
  if (metaField.includes("duedate")) return true;
  if (msg.includes("duedate") && (msg.includes("not null") || msg.includes("null value") || msg.includes("23502")))
    return true;
  // Prisma: 일반적으로 nullable 위반 시 P2011 (메타에 필드명이 없을 수도 있음)
  if (err.code === "P2011" && (msg.includes("duedate") || metaField.includes("duedate"))) return true;
  return false;
}

function serializeTaskDetail(task: {
  assignees?: { user?: import("@/lib/task-assignees").TaskAssigneeUser | null }[] | null;
  assignedTo: import("@/lib/task-assignees").TaskAssigneeUser | null;
  children?: {
    assignees?: { user?: import("@/lib/task-assignees").TaskAssigneeUser | null }[] | null;
    assignedTo: import("@/lib/task-assignees").TaskAssigneeUser | null;
    [key: string]: unknown;
  }[];
  [key: string]: unknown;
}) {
  const { assignees: rows, children: rawChildren, ...rest } = task;
  const { assignees, assignedTo } = serializeAssigneesFromRows(rows ?? [], task.assignedTo);
  const children = rawChildren?.map((c) => {
    const { assignees: crows, ...crest } = c as typeof c & {
      assignees?: { user: import("@/lib/task-assignees").TaskAssigneeUser }[];
    };
    const ca = serializeAssigneesFromRows(crows ?? [], c.assignedTo);
    return { ...crest, assignees: ca.assignees, assignedTo: ca.assignedTo };
  });
  return { ...rest, assignees, assignedTo, ...(children != null ? { children } : {}) };
}

/**
 * DB에 Task.color 컬럼이 없을 때용: 루트 select에 color를 넣지 않아 SELECT 절에서 제외됨.
 * (omit + include 조합은 런타임/버전에 따라 실패할 수 있음)
 */
function buildTaskDetailSelect(deferComments: boolean): Prisma.TaskSelect {
  return {
    id: true,
    title: true,
    description: true,
    dueDate: true,
    isCompleted: true,
    status: true,
    priority: true,
    isRecurring: true,
    recurringDays: true,
    recurringRule: true,
    recurringMemo: true,
    projectId: true,
    creationSource: true,
    googleTaskId: true,
    syncedFromGoogle: true,
    parentId: true,
    categoryId: true,
    orderIndex: true,
    isCollapsed: true,
    scope: true,
    deletedAt: true,
    deletedById: true,
    createdAt: true,
    updatedAt: true,
    completedAt: true,
    archivedAt: true,
    assignedToId: true,
    createdById: true,
    parent: {
      select: {
        id: true,
        title: true,
      },
    },
    children: {
      where: { deletedAt: null },
      select: {
        id: true,
        title: true,
        dueDate: true,
        isCompleted: true,
        status: true,
        priority: true,
        orderIndex: true,
        isCollapsed: true,
        completedAt: true,
        archivedAt: true,
        assignedTo: {
          select: taskAssigneeUserSelect,
        },
        assignees: {
          select: { user: { select: taskAssigneeUserSelect } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ orderIndex: "asc" }, { dueDate: "asc" }],
    },
    assignees: {
      select: { user: { select: taskAssigneeUserSelect } },
      orderBy: { createdAt: "asc" },
    },
    assignedTo: {
      select: taskAssigneeUserSelect,
    },
    createdBy: {
      select: {
        id: true,
        name: true,
        position: true,
      },
    },
    project: {
      select: {
        id: true,
        name: true,
        brand: { select: { name: true } },
      },
    },
    attachments: {
      where: { deletedAt: null },
      select: {
        id: true,
        type: true,
        url: true,
        name: true,
        createdAt: true,
      },
    },
    ...(deferComments
      ? {}
      : {
          comments: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" as const },
            select: {
              id: true,
              body: true,
              createdAt: true,
              userId: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  position: true,
                },
              },
            },
          },
        }),
  };
}

function buildTaskDetailInclude(deferComments: boolean): Prisma.TaskInclude {
  return {
    parent: {
      select: {
        id: true,
        title: true,
      },
    },
    children: {
      where: { deletedAt: null },
      select: {
        id: true,
        title: true,
        dueDate: true,
        isCompleted: true,
        status: true,
        priority: true,
        orderIndex: true,
        isCollapsed: true,
        completedAt: true,
        archivedAt: true,
        assignedTo: {
          select: taskAssigneeUserSelect,
        },
        assignees: {
          select: { user: { select: taskAssigneeUserSelect } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ orderIndex: "asc" }, { dueDate: "asc" }],
    },
    assignees: {
      select: { user: { select: taskAssigneeUserSelect } },
      orderBy: { createdAt: "asc" },
    },
    assignedTo: {
      select: taskAssigneeUserSelect,
    },
    createdBy: {
      select: {
        id: true,
        name: true,
        position: true,
      },
    },
    project: {
      select: {
        id: true,
        name: true,
        brand: { select: { name: true } },
      },
    },
    attachments: {
      where: { deletedAt: null },
      select: {
        id: true,
        type: true,
        url: true,
        name: true,
        createdAt: true,
      },
    },
    ...(deferComments
      ? {}
      : {
          comments: {
            where: { deletedAt: null },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  position: true,
                },
              },
            },
            orderBy: { createdAt: "asc" as const },
          },
        }),
  };
}

async function loadTaskForDetailGet(taskId: string, deferComments: boolean) {
  const include = buildTaskDetailInclude(deferComments);
  try {
    return await prisma.task.findUnique({
      where: { id: taskId },
      include,
    });
  } catch (e) {
    if (!isPrismaTaskColorColumnMissing(e)) throw e;
    const select = buildTaskDetailSelect(deferComments);
    try {
      return await prisma.task.findUnique({
        where: { id: taskId },
        select,
      });
    } catch (e2) {
      console.error("[tasks] GET loadTaskForDetailGet: color-column fallback failed", e2);
      throw e;
    }
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let exposeDetails = false;
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    exposeDetails = shouldExposeDebugDetails(req, session);

    const { id } = await params;
    // [PERF-auto] deferComments=1: 본문·메타는 먼저 응답, 댓글은 GET /api/tasks/[id]/comments 병렬 로드
    const deferComments = new URL(req.url).searchParams.get("deferComments") === "1";
    const [scope, task, revisions] = await Promise.all([
      getServerWorkspaceScopeFromRequest(req),
      loadTaskForDetailGet(id, deferComments),
      (async () => {
        try {
          return await prisma.taskRevision.findMany({
            where: { taskId: id },
            orderBy: { createdAt: "asc" },
            include: {
              user: { select: { id: true, name: true, position: true } },
            },
          });
        } catch (revErr) {
          console.error("[tasks] GET revisions skipped:", revErr);
          return [];
        }
      })(),
    ]);
    if (!task || (task as { deletedAt?: Date | null }).deletedAt) {
      return NextResponse.json(
        { error: "not_found", message: "존재하지 않거나 삭제된 프로젝트입니다." },
        { status: 404 }
      );
    }
    const taskScope = (task as { scope?: string }).scope ?? "TEAM";
    if (taskScope !== scope) {
      return NextResponse.json(
        {
          error: "workspace_mismatch",
          message:
            taskScope === "TEAM"
              ? "이 프로젝트는 팀(회사) 업무입니다. 상단에서 회사(팀) 모드로 전환한 뒤 다시 열어 주세요."
              : "이 프로젝트는 개인 업무입니다. 개인 모드로 전환한 뒤 다시 열어 주세요.",
          taskScope,
          requestScope: scope,
        },
        { status: 403 }
      );
    }
    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    const assigneeRows = (task.assignees ?? []) as { user?: { id: string }; userId: string }[];
    const isAssignee =
      task.assignedToId === session.user.id ||
      assigneeRows.some((a) => (a.user?.id ?? a.userId) === session.user.id);
    if (!isAdmin && !isAssignee) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const detail = serializeTaskDetail(
      task as unknown as Parameters<typeof serializeTaskDetail>[0]
    );
    const colorNorm = (detail as { color?: string | null }).color ?? null;
    return NextResponse.json({
      ...detail,
      color: colorNorm,
      ...(deferComments ? { comments: [] } : {}),
      revisions,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[tasks] GET /api/tasks/[id] failed:", msg, e);
    return NextResponse.json(
      {
        error: "프로젝트를 불러올 수 없습니다.",
        ...(process.env.NODE_ENV === "development" || exposeDetails ? { details: msg } : {}),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let exposeDetails = false;
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    exposeDetails = shouldExposeDebugDetails(req, session);

    const { id } = await params;
    const body = await req.json();
    // DB에 Task.color 컬럼이 없는 환경에서 findFirst 기본 선택(스칼라 전체)이 500을 유발함
    const existing = await prisma.task.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        title: true,
        description: true,
        dueDate: true,
        isCompleted: true,
        status: true,
        priority: true,
        isRecurring: true,
        recurringDays: true,
        recurringRule: true,
        recurringMemo: true,
        scope: true,
        projectId: true,
        archivedAt: true,
        completedAt: true,
        assignedToId: true,
        createdById: true,
        creationSource: true,
        googleTaskId: true,
        updatedAt: true,
        assignees: { select: { userId: true } },
        assignedTo: { select: { name: true } },
      },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "not_found", message: "존재하지 않거나 삭제된 프로젝트입니다." },
        { status: 404 }
      );
    }
    const scope = await getServerWorkspaceScopeFromRequest(req);
    const existingScope = (existing as { scope?: string }).scope ?? "TEAM";
    if (existingScope !== scope) {
      return NextResponse.json(
        {
          error: "workspace_mismatch",
          message:
            existingScope === "TEAM"
              ? "이 프로젝트는 팀(회사) 업무입니다. 회사(팀) 모드에서 수정해 주세요."
              : "이 프로젝트는 개인 업무입니다. 개인 모드에서 수정해 주세요.",
          taskScope: existingScope,
          requestScope: scope,
        },
        { status: 403 }
      );
    }

    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    const isAssignee =
      existing.assignedToId === session.user.id ||
      existing.assignees.some((a) => a.userId === session.user.id);
    if (!isAdmin && !isAssignee) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const creationSourceFieldSchema = z.enum([
      "PROJECT",
      "MINDMAP",
      "SCHEDULE",
      "MEMO",
      "UNKNOWN",
      "GOOGLE",
    ]);
    let nextCreationSource: TaskCreationSource | undefined;
    if ("creationSource" in body && body.creationSource !== undefined && body.creationSource !== null) {
      const parsed = creationSourceFieldSchema.safeParse(body.creationSource);
      if (!parsed.success) {
        return NextResponse.json({ error: "유효하지 않은 creationSource입니다." }, { status: 400 });
      }
      nextCreationSource = parsed.data;
      const canChangeCreationSource =
        isAdmin || (existing.createdById != null && existing.createdById === session.user.id);
      if (!canChangeCreationSource) {
        return NextResponse.json(
          { error: "출처(creationSource)는 작성자 또는 관리자만 변경할 수 있습니다." },
          { status: 403 }
        );
      }
    }

    let assigneeIdsUpdate: string[] | undefined;
    if (Array.isArray(body.assigneeIds)) {
      const arr = body.assigneeIds as unknown[];
      const raw = arr.filter((x): x is string => typeof x === "string" && x.length > 0);
      assigneeIdsUpdate = [...new Set(raw)];
    } else if ("assignedToId" in body && !Array.isArray(body.assigneeIds)) {
      if (typeof body.assignedToId === "string" && body.assignedToId.trim()) {
        assigneeIdsUpdate = [body.assignedToId.trim()];
      } else if (body.assignedToId === null || body.assignedToId === "") {
        assigneeIdsUpdate = [];
      }
    }

    const data: {
      isCompleted?: boolean;
      isCollapsed?: boolean;
      status?: "TODO" | "IN_PROGRESS" | "DONE";
      orderIndex?: number;
      title?: string;
      description?: string | null;
      assignedToId?: string | null;
      categoryId?: string | null;
      parentId?: string | null;
      dueDate?: Date | null;
      priority?: "HIGH" | "MEDIUM" | "LOW";
      isRecurring?: boolean;
      recurringDays?: string | null;
      recurringRule?: any;
      recurringMemo?: string | null;
      color?: string | null;
      projectId?: string | null;
      creationSource?: TaskCreationSource;
      archivedAt?: Date | null;
      completedAt?: Date | null;
    } = {};
    if (typeof body.isCompleted === "boolean") {
      data.isCompleted = body.isCompleted;
      if (body.isCompleted) data.status = "DONE";
    }
    if (typeof body.isCollapsed === "boolean") data.isCollapsed = body.isCollapsed;
    if (body.status === "TODO" || body.status === "IN_PROGRESS" || body.status === "DONE") data.status = body.status;
    if (typeof body.orderIndex === "number") data.orderIndex = body.orderIndex;
    if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
    if ("description" in body) {
      const expectedRaw = body.expectedUpdatedAt;
      if (expectedRaw != null && typeof expectedRaw === "string" && expectedRaw.trim()) {
        const expectedMs = new Date(expectedRaw).getTime();
        const serverUpdated = existing.updatedAt;
        if (
          !Number.isNaN(expectedMs) &&
          serverUpdated instanceof Date &&
          !Number.isNaN(serverUpdated.getTime()) &&
          serverUpdated.getTime() !== expectedMs
        ) {
          return NextResponse.json(
            {
              error: "conflict",
              message: "다른 곳에서 본문이 수정되었습니다. 새로고침 후 다시 시도해 주세요.",
              serverUpdatedAt: serverUpdated.toISOString(),
            },
            { status: 409 }
          );
        }
      }
      data.description = body.description ?? null;
    }
    if (assigneeIdsUpdate !== undefined) {
      data.assignedToId = assigneeIdsUpdate[0] ?? null;
    }
    if ("categoryId" in body) data.categoryId = body.categoryId === null || body.categoryId === "" ? null : body.categoryId;
    if ("parentId" in body) data.parentId = body.parentId === null || body.parentId === "" ? null : body.parentId;
    if ("dueDate" in body) {
      if (body.dueDate === null || body.dueDate === "") {
        data.dueDate = null;
      } else if (typeof body.dueDate === "string") {
        const parsedDue = new Date(body.dueDate);
        if (Number.isNaN(parsedDue.getTime())) {
          return NextResponse.json({ error: "마감일 형식이 올바르지 않습니다." }, { status: 400 });
        }
        data.dueDate = parsedDue;
      }
    }
    if (body.priority === "HIGH" || body.priority === "MEDIUM" || body.priority === "LOW") data.priority = body.priority;
    if (typeof body.isRecurring === "boolean") {
      data.isRecurring = body.isRecurring;
    }
    const turningOffRecurring = body.isRecurring === false;
    if (turningOffRecurring) {
      data.recurringDays = null;
      data.recurringRule = null;
      data.recurringMemo = null;
    } else {
      if ("recurringDays" in body) {
        if (body.recurringDays === null || body.recurringDays === "") data.recurringDays = null;
        else if (typeof body.recurringDays === "string") data.recurringDays = body.recurringDays;
      }
      if ("recurringRule" in body) {
        if (body.recurringRule === null) data.recurringRule = null;
        else data.recurringRule = body.recurringRule;
      }
      if ("recurringMemo" in body) {
        data.recurringMemo =
          body.recurringMemo === null || body.recurringMemo === ""
            ? null
            : String(body.recurringMemo);
      }
    }

    // 마감일 제거 시 반복 규칙은 함께 해제(미설정 마감 + 반복 동시 유지 불가)
    if (data.dueDate === null && existing.isRecurring) {
      data.isRecurring = false;
      data.recurringDays = null;
      data.recurringRule = null;
      data.recurringMemo = null;
    }

    const mergedDueDate =
      data.dueDate !== undefined
        ? data.dueDate
        : existing.dueDate instanceof Date && !Number.isNaN(existing.dueDate.getTime())
          ? existing.dueDate
          : null;
    const mergedRecurring = data.isRecurring !== undefined ? data.isRecurring : existing.isRecurring;
    if (mergedRecurring && mergedDueDate == null) {
      return NextResponse.json(
        { error: "반복 업무를 켜려면 마감일이 필요합니다." },
        { status: 400 }
      );
    }

    if ("color" in body) {
      if (body.color === null || body.color === "") {
        data.color = null;
      } else if (typeof body.color === "string") {
        const c = body.color.trim();
        if (PROJECT_TASK_COLOR_SET.has(c)) data.color = c;
      }
    }

    if ("projectId" in body) {
      if (body.projectId === null || body.projectId === "") {
        data.projectId = null;
      } else if (typeof body.projectId === "string" && body.projectId.trim()) {
        data.projectId = body.projectId.trim();
      }
    }
    if (nextCreationSource !== undefined) {
      data.creationSource = nextCreationSource;
    }
    if ("archivedAt" in body) {
      if (body.archivedAt === null || body.archivedAt === "") {
        data.archivedAt = null;
      } else if (typeof body.archivedAt === "string") {
        const ad = new Date(body.archivedAt);
        if (!Number.isNaN(ad.getTime())) data.archivedAt = ad;
      }
    }

    const nextStatusForLifecycle =
      data.status !== undefined
        ? data.status
        : typeof body.isCompleted === "boolean" && body.isCompleted
          ? ("DONE" as const)
          : existing.status;
    if (nextStatusForLifecycle === "DONE" && existing.status !== "DONE") {
      (data as { completedAt?: Date }).completedAt = new Date();
    }
    if (
      (nextStatusForLifecycle === "TODO" || nextStatusForLifecycle === "IN_PROGRESS") &&
      existing.status === "DONE"
    ) {
      (data as { completedAt?: Date | null; archivedAt?: Date | null }).completedAt = null;
      (data as { completedAt?: Date | null; archivedAt?: Date | null }).archivedAt = null;
    }

    // 수정 이력 기록 (누가, 무엇을, 언제)
    const statusLabels: Record<string, string> = { TODO: "할 일", IN_PROGRESS: "진행 중", DONE: "완료" };
    const priorityLabels: Record<string, string> = { HIGH: "높음", MEDIUM: "보통", LOW: "낮음" };
    const revisions: { field: string; oldValue: string | null; newValue: string | null }[] = [];
    if (data.title !== undefined && data.title !== existing.title) {
      revisions.push({ field: "title", oldValue: existing.title, newValue: data.title });
    }
    if (data.description !== undefined && data.description !== (existing.description ?? null)) {
      revisions.push({
        field: "description",
        oldValue: revisionBodyPreview(existing.description ?? null),
        newValue: revisionBodyPreview(data.description ?? null),
      });
    }
    if (data.status !== undefined && data.status !== existing.status) {
      revisions.push({
        field: "status",
        oldValue: statusLabels[existing.status] ?? existing.status,
        newValue: statusLabels[data.status] ?? data.status,
      });
    }
    if (data.dueDate !== undefined) {
      const prevIso =
        existing.dueDate instanceof Date && !Number.isNaN(existing.dueDate.getTime())
          ? existing.dueDate.toISOString().slice(0, 10)
          : null;
      const nextIso =
        data.dueDate === null
          ? null
          : data.dueDate instanceof Date && !Number.isNaN(data.dueDate.getTime())
            ? data.dueDate.toISOString().slice(0, 10)
            : null;
      if (prevIso !== nextIso) {
        revisions.push({
          field: "dueDate",
          oldValue: prevIso ?? "(없음)",
          newValue: nextIso ?? "(없음)",
        });
      }
    }
    if (assigneeIdsUpdate !== undefined) {
      const oldIds = existing.assignees.map((a) => a.userId);
      const newIds = assigneeIdsUpdate;
      const oldSet = new Set(oldIds);
      const newSet = new Set(newIds);
      const assigneesUnchanged =
        oldSet.size === newSet.size && [...oldSet].every((uid) => newSet.has(uid));
      if (!assigneesUnchanged) {
        try {
          const [oldUsers, newUsers] = await Promise.all([
            oldIds.length
              ? prisma.user.findMany({ where: { id: { in: oldIds } }, select: { id: true, name: true } })
              : Promise.resolve([]),
            newIds.length
              ? prisma.user.findMany({ where: { id: { in: newIds } }, select: { id: true, name: true } })
              : Promise.resolve([]),
          ]);
          const namesInOrder = (ids: string[], users: { id: string; name: string }[]) => {
            const m = new Map(users.map((u) => [u.id, u.name]));
            return ids.map((uid) => m.get(uid) ?? uid).join(", ");
          };
          revisions.push({
            field: "assignees",
            oldValue: namesInOrder(oldIds, oldUsers) || "(없음)",
            newValue: namesInOrder(newIds, newUsers) || "(없음)",
          });
        } catch (assigneeRevErr) {
          console.error("[tasks] PATCH revision assignees lookup skipped:", assigneeRevErr);
        }
      }
    }
    if (data.priority !== undefined && data.priority !== existing.priority) {
      revisions.push({
        field: "priority",
        oldValue: priorityLabels[existing.priority] ?? existing.priority,
        newValue: priorityLabels[data.priority] ?? data.priority,
      });
    }
    if (data.isCompleted !== undefined && data.isCompleted !== existing.isCompleted) {
      revisions.push({
        field: "isCompleted",
        oldValue: existing.isCompleted ? "완료" : "미완료",
        newValue: data.isCompleted ? "완료" : "미완료",
      });
    }
    if (data.creationSource !== undefined && data.creationSource !== existing.creationSource) {
      revisions.push({
        field: "creationSource",
        oldValue: existing.creationSource ?? "(없음)",
        newValue: data.creationSource,
      });
    }

    /** DEBUG_TASK_MENTION=1 일 때 응답 헤더용 (알림을 보낸 멘션 대상 수) */
    let mentionNotifyCountForDebug: number | undefined;

    // TaskRevision 테이블이 없는 환경에서도 상태 변경이 깨지지 않도록 방어
    if (revisions.length > 0 && (prisma as any).taskRevision) {
      try {
        await (prisma as any).taskRevision.createMany({
          data: revisions.map((r) => ({
            taskId: id,
            userId: session.user.id,
            field: r.field,
            oldValue: r.oldValue,
            newValue: r.newValue,
          })),
        });
      } catch (revErr) {
        console.error("[tasks] revision write skipped:", revErr);
      }
    }

    /**
     * PATCH 응답용: 루트 select에 color를 넣지 않음 → DB에 color 컬럼이 없어도
     * UPDATE … RETURNING 이 color를 읽지 않아 500을 막을 수 있음.
     * 본문 자동저장(description만)일 때는 댓글·첨부를 읽지 않아 타임아웃/부하를 줄임.
     */
    const touchedKeys = (Object.keys(data) as (keyof typeof data)[]).filter(
      (k) => data[k] !== undefined
    );
    const descriptionOnlyPatch =
      touchedKeys.length === 1 && touchedKeys[0] === "description";

    const patchResultSelectBase = {
      id: true,
      title: true,
      description: true,
      dueDate: true,
      isCompleted: true,
      status: true,
      priority: true,
      isRecurring: true,
      recurringDays: true,
      recurringRule: true,
      recurringMemo: true,
      projectId: true,
      creationSource: true,
      parentId: true,
      categoryId: true,
      orderIndex: true,
      isCollapsed: true,
      scope: true,
      deletedAt: true,
      deletedById: true,
      createdAt: true,
      updatedAt: true,
      completedAt: true,
      archivedAt: true,
      assignedToId: true,
      createdById: true,
      assignedTo: {
        select: taskAssigneeUserSelect,
      },
      assignees: {
        select: { user: { select: taskAssigneeUserSelect } },
        orderBy: { createdAt: "asc" as const },
      },
      createdBy: {
        select: {
          id: true,
          name: true,
          position: true,
        },
      },
    } as const;

    const patchResultSelect: Prisma.TaskSelect = descriptionOnlyPatch
      ? ({ ...patchResultSelectBase } as unknown as Prisma.TaskSelect)
      : ({
          ...patchResultSelectBase,
          attachments: {
            where: { deletedAt: null },
            select: {
              id: true,
              taskId: true,
              type: true,
              url: true,
              name: true,
              createdAt: true,
            },
          },
          comments: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              body: true,
              createdAt: true,
              userId: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  position: true,
                },
              },
            },
          },
        } as unknown as Prisma.TaskSelect);

    const runPatchTransaction = async (patchData: typeof data) =>
      prisma.$transaction(async (tx) => {
        if (assigneeIdsUpdate !== undefined) {
          await tx.taskAssignee.deleteMany({ where: { taskId: id } });
          if (assigneeIdsUpdate.length > 0) {
            await tx.taskAssignee.createMany({
              data: assigneeIdsUpdate.map((userId) => ({ taskId: id, userId })),
              skipDuplicates: true,
            });
          }
        }
        return tx.task.update({
          where: { id },
          data: patchData,
          select: patchResultSelect,
        });
      });

    let taskRow: Awaited<ReturnType<typeof runPatchTransaction>>;
    /** 이미 color 컬럼 없음으로 update 폴백했으면 SELECT color도 불가 */
    let skipColorSelect = false;
    try {
      taskRow = await runPatchTransaction(data);
    } catch (e) {
      if (!isPrismaTaskColorColumnMissing(e)) throw e;
      const { color: _c, ...dataNoColor } = data;
      taskRow = await runPatchTransaction(dataNoColor);
      skipColorSelect = true;
    }

    let colorFromDb: string | null = null;
    if (!skipColorSelect) {
      try {
        const cRow = await prisma.task.findUnique({
          where: { id },
          select: { color: true },
        });
        colorFromDb = cRow?.color ?? null;
      } catch (e) {
        if (isPrismaTaskColorColumnMissing(e)) {
          colorFromDb = null;
        } else {
          console.error("[tasks] PATCH color fetch skipped:", e);
          colorFromDb = null;
        }
      }
    }

    const task = { ...taskRow, color: colorFromDb } as unknown as Parameters<typeof serializeTaskDetail>[0];

    const actorId = session.user.id;
    const auditIf = async (field: string, before: unknown, after: unknown) => {
      const o = serializeAuditValue(before);
      const n = serializeAuditValue(after);
      if (o !== n) await logAudit({ taskId: id, actorId, field, oldValue: o, newValue: n });
    };
    await auditIf("status", existing.status, taskRow.status);
    await auditIf("assignedToId", existing.assignedToId, taskRow.assignedToId);
    await auditIf("dueDate", existing.dueDate, taskRow.dueDate);
    await auditIf("projectId", existing.projectId, taskRow.projectId);
    await auditIf("creationSource", existing.creationSource, taskRow.creationSource);
    await auditIf("archivedAt", existing.archivedAt, taskRow.archivedAt);
    await auditIf("completedAt", existing.completedAt, taskRow.completedAt);

    /** 본문에서 빠진 이미지 블록의 Drive 파일은 저장 성공 후 삭제 (저장 실패 시 Drive 보존) */
    if (data.description !== undefined) {
      const oldDesc = existing.description ?? null;
      const newDesc = data.description ?? null;
      if (oldDesc !== newDesc) {
        const prevIds = collectDriveImageFileIdsFromTaskDescription(oldDesc);
        const nextIds = collectDriveImageFileIdsFromTaskDescription(newDesc);
        const toDelete = [...prevIds].filter((fid) => !nextIds.has(fid));
        if (toDelete.length > 0) {
          console.log("[tasks] PATCH: 본문 이미지 제거 → Drive deleteFile", {
            taskId: id,
            count: toDelete.length,
            fileIdPrefixes: toDelete.map((x) => x.slice(0, 12) + "…"),
          });
          for (const fileId of toDelete) void deleteFile(fileId);
        }
      }
    }

    const nextStatus = (data.status ?? existing.status) as any;
    const becameDone = nextStatus === "DONE" && existing.status !== "DONE";
    if (becameDone) {
      try {
        await createActivityLog(session.user.id, "TASK_COMPLETED", existing.title);
      } catch (logErr) {
        console.error("[tasks] PATCH activity log skipped:", logErr);
      }
      const googleTaskId = existing.googleTaskId;
      if (googleTaskId) {
        const tokenUserId = existing.createdById ?? session.user.id;
        after(() =>
          markGoogleTaskCompleted({ userId: tokenUserId, googleTaskId }).catch((e) =>
            console.error("[tasks] google task complete skipped:", e)
          )
        );
      }
    }

    // 최초 단계 이동 자동 기록 (준비/진행중/완료)
    if (data.status && data.status !== existing.status) {
      try {
        void appendWorkLogOnceForTaskStatus({
          userId: session.user.id,
          dateStr: todayYmdKst(),
          taskId: existing.id,
          taskTitle: existing.title,
          status: data.status,
        });
      } catch (wlErr) {
        console.error("[tasks] PATCH work-log skipped:", wlErr);
      }
    }

    if (assigneeIdsUpdate !== undefined) {
      const prevAssigneeIds = new Set(existing.assignees.map((a) => a.userId));
      for (const uid of assigneeIdsUpdate) {
        if (!prevAssigneeIds.has(uid) && uid !== session.user.id) {
          try {
            await createNotificationWithOptions({
              userId: uid,
              type: "ASSIGNED",
              message: `'${existing.title}' 프로젝트가 배정되었습니다.`,
              link: `/tasks/${id}`,
              actorId: session.user.id,
            });
          } catch (notifyErr) {
            console.error("[tasks] PATCH assigned notify skipped:", notifyErr);
          }
        }
      }
    }

    // 본문 @멘션: 이번 저장에서 새로 추가된 멘션만 알림(자동 저장·본문 수정 시 기존 멘션 재알림 방지).
    if (data.description !== undefined) {
      const prev = new Set(extractMentionedUserIdsFromTaskDescription(existing.description));
      const nextList = extractMentionedUserIdsFromTaskDescription(data.description);
      const nextUnique = [...new Set(nextList)];
      const descChanged = (data.description ?? null) !== (existing.description ?? null);
      const toNotifyRaw = nextUnique.filter((uid) => uid !== session.user.id && !prev.has(uid));
      /** FK·무결성: User 테이블에 없는 id는 알림 생성 스킵 (로그만) */
      let toNotify = toNotifyRaw;
      if (toNotifyRaw.length > 0) {
        try {
          const existingUsers = await prisma.user.findMany({
            where: { id: { in: toNotifyRaw } },
            select: { id: true },
          });
          const ok = new Set(existingUsers.map((u) => u.id));
          const missing = toNotifyRaw.filter((id) => !ok.has(id));
          if (missing.length > 0) {
            console.warn("[tasks] @멘션 알림: DB에 없는 userId (무시됨)", { missing });
          }
          toNotify = toNotifyRaw.filter((id) => ok.has(id));
        } catch (usersErr) {
          console.error("[tasks] PATCH mention users lookup skipped:", usersErr);
          toNotify = [];
        }
      }
      mentionNotifyCountForDebug = toNotify.length;
      const debugMention =
        process.env.NODE_ENV === "development" || process.env.DEBUG_TASK_MENTION === "1";
      if (debugMention) {
        console.warn("[tasks] @멘션 추출", {
          taskId: id,
          prevCount: prev.size,
          nextCount: nextUnique.length,
          descChanged,
          toNotify,
          descIsDoc: String(data.description ?? "").startsWith("__BN_DOC_V1__"),
          actorId: session.user.id,
        });
      }

      const actorName =
        (session.user as { name?: string }).name ||
        (await prisma.user
          .findUnique({ where: { id: session.user.id }, select: { name: true } })
          .catch(() => null))?.name ||
        "팀원";
      for (const uid of toNotify) {
        try {
          await createTaskBodyMentionNotification({
            userId: uid,
            message: `${actorName}님이 '${existing.title}' 프로젝트 페이지에서 회원님을 호출했습니다.`,
            link: `/tasks/${id}`,
            actorId: session.user.id,
          });
        } catch (notifyErr) {
          console.error("[tasks] mention notify:", notifyErr);
        }
      }

      try {
        await syncTaskMentionsForTask(id, nextUnique);
      } catch (syncErr) {
        console.error("[tasks] PATCH mention sync skipped:", syncErr);
      }
    }

    const res = NextResponse.json(
      serializeTaskDetail(task as unknown as Parameters<typeof serializeTaskDetail>[0])
    );
    if (mentionNotifyCountForDebug !== undefined && process.env.DEBUG_TASK_MENTION === "1") {
      res.headers.set("X-Debug-Mention-Notify-Count", String(mentionNotifyCountForDebug));
    }
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[tasks] PATCH /api/tasks/[id] failed:", msg, e);
    if (isTaskDueDateNullConstraintError(e)) {
      return NextResponse.json(
        {
          error: "db_due_date_null",
          message:
            "데이터베이스에 아직 마감일 NULL 허용이 반영되지 않았습니다. 배포 환경에서 Prisma 마이그레이션(예: prisma migrate deploy)을 적용한 뒤 다시 시도해 주세요.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        error: "프로젝트를 수정할 수 없습니다.",
        ...(process.env.NODE_ENV === "development" || exposeDetails ? { details: msg } : {}),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const scope = await getServerWorkspaceScopeFromRequest(req);
    // DB에 Task.color 컬럼이 없는 환경에서도 안전한 select 사용
    const existing = await prisma.task.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        title: true,
        scope: true,
        assignedToId: true,
        createdById: true,
        assignees: { select: { userId: true } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const existingScope = (existing as { scope?: string }).scope ?? "TEAM";
    if (existingScope !== scope) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    const isAssignee =
      existing.assignedToId === session.user.id ||
      existing.assignees.some((a) => a.userId === session.user.id);
    if (!isAdmin && !isAssignee) {
      return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });
    }

    const now = new Date();

    /** 소프트 삭제만 수행(자식·링크·Drive 유지). 하드 삭제·Drive 정리는 Cron. */
    await prisma.task.update({
      where: { id },
      data: { deletedAt: now, deletedById: session.user.id },
    });

    await logAudit({
      taskId: id,
      actorId: session.user.id,
      field: "deletedAt",
      oldValue: null,
      newValue: now.toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "프로젝트를 삭제할 수 없습니다." },
      { status: 500 }
    );
  }
}
