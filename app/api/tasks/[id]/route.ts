import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getServerWorkspaceScopeFromRequest } from "@/lib/workspace";
import { appendWorkLogOnceForTaskStatus, createActivityLog } from "@/lib/activity-log";
import { createNotificationWithOptions, createTaskBodyMentionNotification } from "@/lib/notifications";
import { extractMentionedUserIdsFromTaskDescription } from "@/lib/task-mention-utils";
import { syncTaskMentionsForTask } from "@/lib/task-mention-sync";
import { todayYmdKst } from "@/lib/date-kst";
import { collectDriveImageFileIdsFromTaskDescription } from "@/lib/task-body-drive-images";
import { deleteFile, parseGoogleDriveFileIdFromUrl } from "@/lib/storage/google-drive-storage";
import { serializeAssigneesFromRows, taskAssigneeUserSelect } from "@/lib/task-assignees";
import { PROJECT_TASK_COLOR_SET } from "@/lib/project-task-colors";
import { isPrismaTaskColorColumnMissing } from "@/lib/prisma-task-color-fallback";
import type { Prisma } from "@prisma/client";

/** Prisma·DB는 Node 런타임 전제 (Edge에서 cookies/Prisma 이슈 방지) */
export const runtime = "nodejs";

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
    recurringMemo: true,
    projectId: true,
    parentId: true,
    categoryId: true,
    orderIndex: true,
    isCollapsed: true,
    scope: true,
    deletedAt: true,
    deletedById: true,
    createdAt: true,
    updatedAt: true,
    assignedToId: true,
    createdById: true,
    parent: {
      select: {
        id: true,
        title: true,
      },
    },
    children: {
      select: {
        id: true,
        title: true,
        dueDate: true,
        isCompleted: true,
        status: true,
        priority: true,
        orderIndex: true,
        isCollapsed: true,
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
      select: {
        id: true,
        title: true,
        dueDate: true,
        isCompleted: true,
        status: true,
        priority: true,
        orderIndex: true,
        isCollapsed: true,
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
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
    const isCreator = task.createdById === session.user.id;
    if (!isAdmin && !isAssignee && !isCreator) {
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
        ...(process.env.NODE_ENV === "development" ? { details: msg } : {}),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const existing = await prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: {
        assignedTo: { select: { name: true } },
        assignees: { select: { userId: true } },
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
    const isCreator = existing.createdById === session.user.id;
    if (!isAdmin && !isAssignee && !isCreator) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
      dueDate?: Date;
      priority?: "HIGH" | "MEDIUM" | "LOW";
      isRecurring?: boolean;
      recurringDays?: string | null;
      recurringMemo?: string | null;
      color?: string | null;
    } = {};
    if (typeof body.isCompleted === "boolean") {
      data.isCompleted = body.isCompleted;
      if (body.isCompleted) data.status = "DONE";
    }
    if (typeof body.isCollapsed === "boolean") data.isCollapsed = body.isCollapsed;
    if (body.status === "TODO" || body.status === "IN_PROGRESS" || body.status === "DONE") data.status = body.status;
    if (typeof body.orderIndex === "number") data.orderIndex = body.orderIndex;
    if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
    if ("description" in body) data.description = body.description ?? null;
    if (assigneeIdsUpdate !== undefined) {
      data.assignedToId = assigneeIdsUpdate[0] ?? null;
    }
    if ("categoryId" in body) data.categoryId = body.categoryId === null || body.categoryId === "" ? null : body.categoryId;
    if ("parentId" in body) data.parentId = body.parentId === null || body.parentId === "" ? null : body.parentId;
    if (typeof body.dueDate === "string") data.dueDate = new Date(body.dueDate);
    if (body.priority === "HIGH" || body.priority === "MEDIUM" || body.priority === "LOW") data.priority = body.priority;
    if (typeof body.isRecurring === "boolean") {
      data.isRecurring = body.isRecurring;
    }
    const turningOffRecurring = body.isRecurring === false;
    if (turningOffRecurring) {
      data.recurringDays = null;
      data.recurringMemo = null;
    } else {
      if ("recurringDays" in body) {
        if (body.recurringDays === null || body.recurringDays === "") data.recurringDays = null;
        else if (typeof body.recurringDays === "string") data.recurringDays = body.recurringDays;
      }
      if ("recurringMemo" in body) {
        data.recurringMemo =
          body.recurringMemo === null || body.recurringMemo === ""
            ? null
            : String(body.recurringMemo);
      }
    }

    if ("color" in body) {
      if (body.color === null || body.color === "") {
        data.color = null;
      } else if (typeof body.color === "string") {
        const c = body.color.trim();
        if (PROJECT_TASK_COLOR_SET.has(c)) data.color = c;
      }
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
        oldValue: existing.description ?? null,
        newValue: data.description ?? null,
      });
    }
    if (data.status !== undefined && data.status !== existing.status) {
      revisions.push({
        field: "status",
        oldValue: statusLabels[existing.status] ?? existing.status,
        newValue: statusLabels[data.status] ?? data.status,
      });
    }
    if (data.dueDate !== undefined && String(data.dueDate) !== String(existing.dueDate)) {
      revisions.push({
        field: "dueDate",
        oldValue: existing.dueDate.toISOString().slice(0, 10),
        newValue: data.dueDate.toISOString().slice(0, 10),
      });
    }
    if (assigneeIdsUpdate !== undefined) {
      const oldIds = existing.assignees.map((a) => a.userId);
      const newIds = assigneeIdsUpdate;
      const oldSet = new Set(oldIds);
      const newSet = new Set(newIds);
      const assigneesUnchanged =
        oldSet.size === newSet.size && [...oldSet].every((uid) => newSet.has(uid));
      if (!assigneesUnchanged) {
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

    const patchResultInclude = {
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
      attachments: true,
      comments: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              position: true,
            },
          },
        },
      },
    } as const;

    type PatchedTaskForResponse = Prisma.TaskGetPayload<{
      include: typeof patchResultInclude;
    }>;

    const runPatchTransaction = async (
      patchData: typeof data,
      opts?: { omitColor?: boolean }
    ) =>
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
        const updated = await tx.task.update({
          where: { id },
          data: patchData,
          ...(opts?.omitColor ? { omit: { color: true as const } } : {}),
          include: patchResultInclude,
        } as any);
        return updated as unknown as PatchedTaskForResponse;
      });

    let task;
    try {
      task = await runPatchTransaction(data);
    } catch (e) {
      if (data.color === undefined || !isPrismaTaskColorColumnMissing(e)) throw e;
      const { color: _c, ...dataNoColor } = data;
      task = await runPatchTransaction(dataNoColor, { omitColor: true });
    }

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

    // 본문 @멘션: 본문이 실제로 바뀐 저장마다 현재 멘션된 전원에게 알림(본인 제외).
    // Notification은 수신자 userId로만 저장되므로, 멘션 당시 수신자가 로그아웃이어도 이후 로그인 시 /notifications 에서 동일하게 조회됨.
    if (data.description !== undefined) {
      const prev = new Set(extractMentionedUserIdsFromTaskDescription(existing.description));
      const nextList = extractMentionedUserIdsFromTaskDescription(data.description);
      const nextUnique = [...new Set(nextList)];
      const descChanged = (data.description ?? null) !== (existing.description ?? null);
      /** 저장할 때마다 알림: 본문 변경 시 멘션된 모든 사용자(작성자 제외) */
      const toNotifyRaw = descChanged
        ? nextUnique.filter((uid) => uid !== session.user.id)
        : [];
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
    return NextResponse.json(
      {
        error: "프로젝트를 수정할 수 없습니다.",
        ...(process.env.NODE_ENV === "development" ? { details: msg } : {}),
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
    const existing = await prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: { attachments: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const existingScope = (existing as { scope?: string }).scope ?? "TEAM";
    if (existingScope !== scope) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    const isCreator = existing.createdById === session.user.id;
    if (!isAdmin && !isCreator) {
      return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });
    }

    /** 소프트 삭제 전 본문/첨부의 Drive ID 수집 (복원 API에서는 Drive 삭제 안 함) */
    const bodyImageIds = collectDriveImageFileIdsFromTaskDescription(existing.description);
    const driveIds = new Set<string>(bodyImageIds);
    for (const att of existing.attachments) {
      const fid = parseGoogleDriveFileIdFromUrl(att.url);
      if (fid) driveIds.add(fid);
    }

    const now = new Date();

    await prisma.task.updateMany({
      where: { parentId: id },
      data: { parentId: null },
    });

    await prisma.taskLink.deleteMany({
      where: { OR: [{ parentId: id }, { childId: id }] },
    });

    await prisma.task.update({
      where: { id },
      data: { deletedAt: now, deletedById: session.user.id },
    });

    if (driveIds.size > 0) {
      console.log("[tasks] DELETE soft: 게시판과 동일 — Drive 파일 삭제", {
        taskId: id,
        driveFileCount: driveIds.size,
        supportsAllDrives: true,
      });
      await Promise.all([...driveIds].map((fid) => deleteFile(fid)));
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "프로젝트를 삭제할 수 없습니다." },
      { status: 500 }
    );
  }
}
