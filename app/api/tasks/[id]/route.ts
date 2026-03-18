import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getServerWorkspaceScopeFromRequest } from "@/lib/workspace";
import { createActivityLog } from "@/lib/activity-log";
import { createNotificationWithOptions } from "@/lib/notifications";

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
        revisions: {
          include: {
            user: { select: { id: true, name: true, position: true } },
          },
          orderBy: { createdAt: "desc" },
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
    if (revisions.length > 0) {
      await prisma.taskRevision.createMany({
        data: revisions.map((r) => ({
          taskId: id,
          userId: session.user.id,
          field: r.field,
          oldValue: r.oldValue,
          newValue: r.newValue,
        })),
      });
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

    const becameDone =
      (data.status === "DONE" || body.status === "DONE") &&
      existing.status !== "DONE";
    if (becameDone) {
      await createActivityLog(session.user.id, "TASK_COMPLETED", existing.title);
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

    return NextResponse.json(task);
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
