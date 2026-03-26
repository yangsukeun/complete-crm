"use server";

import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createActivityLog } from "@/lib/activity-log";

/** TEAM 워크스페이스 업무를 MY(개인) 워크스페이스로 복제 */
export async function copyTaskToPersonal(taskId: string): Promise<{ ok: true } | { error: string }> {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return { error: "로그인이 필요합니다." };
  }

  const original = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      attachments: true,
      assignees: { select: { userId: true } },
    },
  });

  if (!original) {
    return { error: "업무를 찾을 수 없습니다." };
  }

  if (original.deletedAt) {
    return { error: "삭제된 업무는 가져올 수 없습니다." };
  }

  if (original.scope !== "TEAM") {
    return { error: "공용 업무만 개인으로 가져올 수 있습니다." };
  }

  const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
  const isAssignee =
    original.assignedToId === session.user.id ||
    original.assignees.some((a) => a.userId === session.user.id);
  const isCreator = original.createdById === session.user.id;
  if (!isAdmin && !isAssignee && !isCreator) {
    return { error: "이 업무를 가져올 권한이 없습니다." };
  }

  const title = original.title.startsWith("[스크랩]")
    ? original.title
    : `[스크랩] ${original.title}`;

  const newTask = await prisma.task.create({
    data: {
      title,
      description: original.description,
      dueDate: original.dueDate,
      isCompleted: false,
      status: "TODO",
      priority: original.priority,
      parentId: null,
      categoryId: null,
      orderIndex: 0,
      scope: "PERSONAL",
      assignedToId: session.user.id,
      createdById: session.user.id,
      assignees: {
        create: { userId: session.user.id },
      },
    },
  });

  if (original.attachments.length > 0) {
    await prisma.taskAttachment.createMany({
      data: original.attachments.map((a: any) => ({
        taskId: newTask.id,
        type: a.type,
        url: a.url,
        name: a.name,
      })),
    });
  }

  const dueStr = newTask.dueDate.toISOString().slice(0, 10);
  await createActivityLog(session.user.id, "TASK_CREATED", title, undefined, dueStr ? { timestamp: new Date(dueStr + "T12:00:00") } : undefined);
  revalidatePath("/tasks");

  return { ok: true };
}
