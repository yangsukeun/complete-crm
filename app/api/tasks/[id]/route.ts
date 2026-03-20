import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getServerWorkspaceScopeFromRequest } from "@/lib/workspace";
import { appendWorkLogOnceForTaskStatus, createActivityLog } from "@/lib/activity-log";
import { createNotificationWithOptions, createTaskBodyMentionNotification } from "@/lib/notifications";
import { extractMentionedUserIdsFromTaskDescription } from "@/lib/task-mention-utils";
import { syncTaskMentionsForTask } from "@/lib/task-mention-sync";
import { format } from "date-fns";

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
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
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
              select: { id: true, name: true, email: true, position: true },
            },
          },
          orderBy: [{ orderIndex: "asc" }, { dueDate: "asc" }],
        },
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
            position: true,
          },
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
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!task) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const scope = await getServerWorkspaceScopeFromRequest(req);
    const taskScope = (task as { scope?: string }).scope ?? "TEAM";
    if (taskScope !== scope) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    const isAssignee = task.assignedToId === session.user.id;
    const isCreator = task.createdById === session.user.id;
    if (!isAdmin && !isAssignee && !isCreator) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(task);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "업무를 불러올 수 없습니다." },
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
    const existing = await prisma.task.findUnique({
      where: { id },
      include: { assignedTo: { select: { name: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const scope = await getServerWorkspaceScopeFromRequest(req);
    const existingScope = (existing as { scope?: string }).scope ?? "TEAM";
    if (existingScope !== scope) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    const isAssignee = existing.assignedToId === session.user.id;
    const isCreator = existing.createdById === session.user.id;
    if (!isAdmin && !isAssignee && !isCreator) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data: {
      isCompleted?: boolean;
      isCollapsed?: boolean;
      status?: "TODO" | "IN_PROGRESS" | "DONE";
      orderIndex?: number;
      title?: string;
      description?: string | null;
      assignedToId?: string;
      categoryId?: string | null;
      parentId?: string | null;
      dueDate?: Date;
      priority?: "HIGH" | "MEDIUM" | "LOW";
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
    if (typeof body.assignedToId === "string") data.assignedToId = body.assignedToId;
    if ("categoryId" in body) data.categoryId = body.categoryId === null || body.categoryId === "" ? null : body.categoryId;
    if ("parentId" in body) data.parentId = body.parentId === null || body.parentId === "" ? null : body.parentId;
    if (typeof body.dueDate === "string") data.dueDate = new Date(body.dueDate);
    if (body.priority === "HIGH" || body.priority === "MEDIUM" || body.priority === "LOW") data.priority = body.priority;

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
    if (data.assignedToId !== undefined && data.assignedToId !== existing.assignedToId) {
      const newUser = data.assignedToId
        ? await prisma.user.findUnique({ where: { id: data.assignedToId }, select: { name: true } })
        : null;
      revisions.push({
        field: "assignedToId",
        oldValue: (existing.assignedTo as { name?: string })?.name ?? existing.assignedToId,
        newValue: newUser?.name ?? data.assignedToId,
      });
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

    const task = await prisma.task.update({
      where: { id },
      data,
      include: {
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
            position: true,
          },
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
      },
    });

    const nextStatus = (data.status ?? existing.status) as any;
    const becameDone = nextStatus === "DONE" && existing.status !== "DONE";
    if (becameDone) {
      await createActivityLog(session.user.id, "TASK_COMPLETED", existing.title);
    }

    // 최초 단계 이동 자동 기록 (준비/진행중/완료)
    if (data.status && data.status !== existing.status) {
      void appendWorkLogOnceForTaskStatus({
        userId: session.user.id,
        dateStr: format(new Date(), "yyyy-MM-dd"),
        taskId: existing.id,
        taskTitle: existing.title,
        status: data.status,
      });
    }

    if (data.assignedToId && data.assignedToId !== existing.assignedToId && data.assignedToId !== session.user.id) {
      await createNotificationWithOptions({
        userId: data.assignedToId,
        type: "ASSIGNED",
        message: `'${existing.title}' 업무가 배정되었습니다.`,
        link: `/tasks/${id}`,
        actorId: session.user.id,
      });
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
        (await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true } }))?.name ||
        "팀원";
      for (const uid of toNotify) {
        try {
          await createTaskBodyMentionNotification({
            userId: uid,
            message: `${actorName}님이 '${existing.title}' 업무 페이지에서 회원님을 호출했습니다.`,
            link: `/tasks/${id}`,
            actorId: session.user.id,
          });
        } catch (notifyErr) {
          console.error("[tasks] mention notify:", notifyErr);
        }
      }

      await syncTaskMentionsForTask(id, nextUnique);
    }

    const res = NextResponse.json(task);
    if (mentionNotifyCountForDebug !== undefined && process.env.DEBUG_TASK_MENTION === "1") {
      res.headers.set("X-Debug-Mention-Notify-Count", String(mentionNotifyCountForDebug));
    }
    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "업무를 수정할 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // 관리자, 생성자만 삭제 가능
    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    const isCreator = existing.createdById === session.user.id;
    if (!isAdmin && !isCreator) {
      return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });
    }

    // 하위 업무의 parentId를 null로 변경 (연쇄 삭제 대신)
    await prisma.task.updateMany({
      where: { parentId: id },
      data: { parentId: null },
    });

    // TaskLink 삭제 (추가 연결)
    await prisma.taskLink.deleteMany({
      where: { OR: [{ parentId: id }, { childId: id }] },
    });

    // 업무 삭제
    await prisma.task.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "업무를 삭제할 수 없습니다." },
      { status: 500 }
    );
  }
}
