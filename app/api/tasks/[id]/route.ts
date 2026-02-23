import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { getServerWorkspaceScope } from "@/lib/workspace";
import { createActivityLog } from "@/lib/activity-log";
import { createNotification } from "@/lib/notifications";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
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
            currentProject: { select: { name: true, brand: { select: { name: true } } } },
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            position: true,
            currentProject: { select: { name: true, brand: { select: { name: true } } } },
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
                currentProject: { select: { name: true, brand: { select: { name: true } } } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        children: {
          include: {
            assignedTo: { select: { name: true, position: true } },
            attachments: true,
            comments: {
              include: {
                user: {
                  select: {
                    name: true,
                    position: true,
                    currentProject: { select: { name: true, brand: { select: { name: true } } } },
                  },
                },
              },
            },
          },
          orderBy: { orderIndex: "asc" },
        },
      },
    });
    if (!task) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const scope = await getServerWorkspaceScope();
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const scope = await getServerWorkspaceScope();
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
            currentProject: { select: { name: true, brand: { select: { name: true } } } },
          },
        },
        createdBy: {
          select: {
            name: true,
            position: true,
            currentProject: { select: { name: true, brand: { select: { name: true } } } },
          },
        },
        attachments: true,
        comments: {
          include: {
            user: {
              select: {
                name: true,
                position: true,
                currentProject: { select: { name: true, brand: { select: { name: true } } } },
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
      await createNotification(
        data.assignedToId,
        "ASSIGNED",
        `'${existing.title}' 업무가 배정되었습니다.`,
        `/tasks/${id}`
      );
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
    const session = await auth();
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
