import { startOfDay, endOfDay, addDays } from "date-fns";
import prisma from "@/lib/prisma";

export type NotificationTypeEnum = "DEADLINE" | "ASSIGNED" | "COMMENT" | "STAGNANT";

/**
 * 알림 1건 생성 (수신자, 타입, 메시지, 링크)
 */
export async function createNotification(
  userId: string,
  type: NotificationTypeEnum,
  message: string,
  link: string = ""
): Promise<void> {
  try {
    await prisma.notification.create({
      data: { userId, type, message, link },
    });
  } catch (e) {
    console.error("[Notification] 생성 실패:", e);
  }
}

/**
 * 마감일이 오늘 또는 내일인 미완료 업무를 찾아 담당자에게 DEADLINE 알림 생성.
 * 이미 오늘 같은 업무로 알림을 보낸 경우 스킵 (중복 방지).
 */
export async function checkDeadlines(): Promise<void> {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const tomorrowEnd = endOfDay(addDays(now, 1));

    const tasks = await prisma.task.findMany({
    where: {
      isCompleted: false,
      dueDate: { gte: todayStart, lte: tomorrowEnd },
    },
    select: { id: true, title: true, dueDate: true, assignedToId: true },
  });

  for (const task of tasks) {
    if (!task.assignedToId) continue;
    const dayStart = startOfDay(new Date(task.dueDate));
    const dayEnd = endOfDay(new Date(task.dueDate));
    const existing = await prisma.notification.findFirst({
      where: {
        userId: task.assignedToId,
        type: "DEADLINE",
        link: `/tasks/${task.id}`,
        createdAt: { gte: dayStart, lte: dayEnd },
      },
    });
    if (existing) continue;

    const dueDateStr = task.dueDate.toLocaleDateString("ko-KR", {
      month: "long",
      day: "numeric",
    });
    const isToday = startOfDay(new Date(task.dueDate)).getTime() === todayStart.getTime();
    const message = isToday
      ? `'${task.title}' 마감이 오늘입니다.`
      : `'${task.title}' 마감이 1일 남았습니다. (${dueDateStr})`;

    await createNotification(
      task.assignedToId,
      "DEADLINE",
      message,
      `/tasks/${task.id}`
    );
  }
  } catch (e) {
    console.error("[Notification] checkDeadlines 실패:", e);
  }
}
