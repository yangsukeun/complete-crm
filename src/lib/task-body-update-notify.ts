import "server-only";

import prisma from "@/lib/prisma";
import { createNotificationWithOptions } from "@/lib/notifications";

/** 같은 프로젝트 글 변경 알림을 이미 읽었다면 이 시간 안에는 다시 보내지 않는다(자동 저장 연타 방지) */
const QUIET_AFTER_READ_MS = 30 * 60 * 1000;

/**
 * 프로젝트 글(본문)이 바뀌면 프로젝트 담당자·작성자에게 알린다.
 * - 본문이 비어 있다가 처음 채워지면 "새로 작성", 아니면 "업데이트"
 * - 글쓴이 본인과 이번 저장에서 @멘션 알림을 받은 사람은 제외
 * - 자동 저장이 몇 초마다 일어나므로: 안 읽은 알림이 있으면 그 알림만 갱신(푸시 없음),
 *   30분 안에 이미 읽었으면 건너뛴다
 */
export async function notifyTaskBodyUpdated(input: {
  taskId: string;
  taskTitle: string;
  actorId: string;
  actorName: string;
  wasEmpty: boolean;
  recipientIds: string[];
  skipIds?: string[];
}): Promise<void> {
  const skip = new Set([input.actorId, ...(input.skipIds ?? [])]);
  const recipients = [...new Set(input.recipientIds)].filter((id) => id && !skip.has(id));
  if (recipients.length === 0) return;

  const link = `/tasks/${input.taskId}`;
  const message = input.wasEmpty
    ? `${input.actorName}님이 '${input.taskTitle}' 프로젝트 글을 새로 작성했습니다.`
    : `${input.actorName}님이 '${input.taskTitle}' 프로젝트 글을 업데이트했습니다.`;

  const recentRead = await prisma.notification.findMany({
    where: {
      userId: { in: recipients },
      type: "TASK_BODY_UPDATED",
      link,
      isRead: true,
      createdAt: { gte: new Date(Date.now() - QUIET_AFTER_READ_MS) },
    },
    select: { userId: true },
  });
  const quiet = new Set(recentRead.map((n) => n.userId));

  await Promise.allSettled(
    recipients
      .filter((userId) => !quiet.has(userId))
      .map((userId) =>
        createNotificationWithOptions({
          userId,
          type: "TASK_BODY_UPDATED",
          message,
          link,
          actorId: input.actorId,
          pushTitle: "프로젝트 글",
        })
      )
  );
}
