import { startOfDay, endOfDay, addDays } from "date-fns";
import prisma from "@/lib/prisma";
import { sendPushToUser as sendPushToUserImpl } from "./notifications/push";
import { cancelOneSignalPush, syncBadgeCount } from "@/lib/onesignal/cancel";

/**
 * OneSignal 웹 푸시 (실제 구현: `./notifications/push.ts`의 `sendPushToUser` / `sendPushToUsers`).
 *
 * - **URL**: `https://api.onesignal.com/notifications`
 * - **Authorization**: `Key ${ONESIGNAL_REST_API_KEY}` (`ONE_SIGNAL_REST_API_KEY` 폴백)
 * - **Content-Type**: `application/json`
 * - **App ID**: `ONESIGNAL_APP_ID` 또는 `NEXT_PUBLIC_ONESIGNAL_APP_ID`
 */
export async function sendPushToUser(
  input: Parameters<typeof sendPushToUserImpl>[0]
): Promise<void> {
  try {
    await sendPushToUserImpl(input);
  } catch (e) {
    console.error("[notifications] sendPushToUser 실패", {
      userId: input.userId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}

export type NotificationTypeEnum =
  | "DEADLINE"
  | "ASSIGNED"
  | "COMMENT"
  | "STAGNANT"
  | "BOARD_MENTION"
  | "TASK_BODY_MENTION"
  | "CHAT_MESSAGE"
  | "NOTICE_POSTED"
  | "WORK_LOG_SUBMITTED"
  | "LEAVE_REQUEST"
  | "PROJECT_COMPLETED"
  | "TASK_ORPHAN"
  | "TASK_DUE_D3"
  | "TASK_DUE_D1"
  | "TASK_DUE_OVERDUE"
  | "DAILY_DIGEST"
  | "LEAVE_COMPENSATION";
export type NotificationPriority = "high" | "medium" | "low";

type CreateNotificationInput = {
  userId: string;
  type: NotificationTypeEnum;
  message: string;
  link?: string;
  actorId?: string | null;
  priority?: NotificationPriority;
  /** 지정 시 OneSignal 제목(기본: "새 알림") */
  pushTitle?: string;
  /** true면 DB만 저장하고 푸시는 보내지 않음 */
  skipPush?: boolean;
};

const DEFAULT_PRIORITY_BY_TYPE: Record<NotificationTypeEnum, NotificationPriority> = {
  DEADLINE: "high",
  ASSIGNED: "high",
  COMMENT: "medium",
  STAGNANT: "medium",
  BOARD_MENTION: "medium",
  TASK_BODY_MENTION: "medium",
  CHAT_MESSAGE: "medium",
  NOTICE_POSTED: "high",
  WORK_LOG_SUBMITTED: "high",
  LEAVE_REQUEST: "high",
  PROJECT_COMPLETED: "medium",
  TASK_ORPHAN: "high",
  TASK_DUE_D3: "high",
  TASK_DUE_D1: "high",
  TASK_DUE_OVERDUE: "high",
  DAILY_DIGEST: "medium",
  LEAVE_COMPENSATION: "high",
};

/**
 * 알림 1건 생성 (수신자, 타입, 메시지, 링크)
 * - 기존 시그니처 유지 (DB 저장 + 필요 시 푸시)
 */
export async function createNotification(
  userId: string,
  type: NotificationTypeEnum,
  message: string,
  link: string = ""
): Promise<void> {
  await createNotificationWithOptions({ userId, type, message, link });
}

/** 채팅방 열람 등: 해당 대화의 미읽음 채팅 알림만 읽음 처리 */
export async function markChatNotificationsRead(userId: string, chatId: string): Promise<number> {
  const canonical = `/chat/${chatId}`;
  const legacy = `/chats/${chatId}`;
  const where = {
    userId,
    type: "CHAT_MESSAGE" as const,
    OR: [{ link: canonical }, { link: legacy }],
    isRead: false,
  };

  const isMissingOneSignalNotificationIdColumnError = (e: unknown): boolean => {
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
    return (
      msg.includes("onesignalnotificationid") ||
      (msg.includes("unknown arg") && msg.includes("onesignal")) ||
      (msg.includes("column") && msg.includes("does not exist") && msg.includes("onesignal"))
    );
  };

  let targets: { oneSignalNotificationId?: string | null }[] = [];
  try {
    targets = await prisma.notification.findMany({
      where,
      select: { oneSignalNotificationId: true },
    });
  } catch (e) {
    // 배포 직후 마이그레이션 미적용 시에도 채팅 로드는 살아야 함
    if (!isMissingOneSignalNotificationIdColumnError(e)) throw e;
    targets = [];
  }

  const result = await prisma.notification.updateMany({ where, data: { isRead: true } });

  const osIds = targets
    .map((n) => n.oneSignalNotificationId)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  if (osIds.length > 0) {
    await Promise.allSettled(osIds.map((id) => cancelOneSignalPush(id)));
  }

  const unreadCount = await prisma.notification.count({ where: { userId, isRead: false } });
  // 배포 직후 OneSignal env/column 미적용이어도 읽음 처리는 성공해야 함
  await syncBadgeCount(userId, unreadCount);

  return result.count;
}

/** 동일 링크·미읽음 알림을 갱신만 하고 푸시는 다시 보내지 않음 (자동 저장·중복 POST 방지) */
const DEDUP_UNREAD_BY_LINK_TYPES: NotificationTypeEnum[] = [
  "CHAT_MESSAGE",
  "BOARD_MENTION",
  "TASK_BODY_MENTION",
];

export async function createNotificationWithOptions(input: CreateNotificationInput): Promise<void> {
  const { userId, type, message, link = "", actorId = null, pushTitle, skipPush = false } = input;
  const priority: NotificationPriority = input.priority ?? DEFAULT_PRIORITY_BY_TYPE[type] ?? "medium";

  let persisted = false;
  let notificationId: string | null = null;
  let mergedExistingUnread = false;
  try {
    if (link && DEDUP_UNREAD_BY_LINK_TYPES.includes(type)) {
      const existing = await prisma.notification.findFirst({
        where: { userId, type, link, isRead: false },
      });
      if (existing) {
        await prisma.notification.update({
          where: { id: existing.id },
          data: { message, createdAt: new Date() },
        });
        persisted = true;
        notificationId = existing.id;
        mergedExistingUnread = true;
      } else {
        const created = await prisma.notification.create({
          data: { userId, type, message, link },
          select: { id: true },
        });
        persisted = true;
        notificationId = created.id;
      }
    } else {
      const created = await prisma.notification.create({
        data: { userId, type, message, link },
        select: { id: true },
      });
      persisted = true;
      notificationId = created.id;
    }
  } catch (e) {
    console.error("[Notification] 생성 실패:", e);
  }

  if (!persisted) return;

  /** 동일 링크 미읽음이면 푸시 재발송하지 않음(채팅 포함 — 메시지마다 푸시 폭주 방지) */
  const skipPushOnMerge = mergedExistingUnread;
  const shouldSendPush =
    !skipPush &&
    !skipPushOnMerge &&
    (priority === "high" || priority === "medium") &&
    (actorId == null || actorId !== userId);

  if (!shouldSendPush) {
    console.log("[Notification→push] 스킵 (푸시 미발송)", {
      userId,
      type,
      priority,
      actorId: actorId ?? null,
      reason:
        skipPush
          ? "skipPush"
          : skipPushOnMerge
            ? "미읽음 병합"
            : priority !== "high" && priority !== "medium"
              ? "priority가 low"
              : actorId != null && actorId === userId
                ? "actorId === 수신자(본인 알림)"
                : "기타",
    });
  } else {
    console.log("[Notification→push] sendPushToUser 호출", { userId, type, actorId: actorId ?? null });
  }

  if (shouldSendPush) {
    await sendPushToUser({
      userId,
      title: pushTitle?.trim() ? pushTitle.trim() : "새 알림",
      message,
      url: link || undefined,
      priority,
      notificationDbId: notificationId ?? undefined,
    });
  }
}

/** 일일 다이제스트: DB 알림 + 푸시(제목 "오늘 업무") */
export async function sendDigestToUser(input: {
  userId: string;
  message: string;
  link?: string;
}): Promise<void> {
  await createNotificationWithOptions({
    userId: input.userId,
    type: "DAILY_DIGEST",
    message: input.message,
    link: input.link ?? "/dashboard",
    pushTitle: "오늘 업무",
  });
}

/**
 * 업무 본문 @멘션 알림. DB에 TASK_BODY_MENTION enum이 없으면 BOARD_MENTION으로 폴백(마이그레이션 전 배포 대비).
 */
export async function createTaskBodyMentionNotification(input: {
  userId: string;
  message: string;
  link?: string;
  actorId: string | null;
}): Promise<void> {
  const { userId, message, link = "", actorId } = input;
  try {
    await createNotificationWithOptions({
      userId,
      type: "TASK_BODY_MENTION",
      message,
      link,
      actorId,
    });
    if (process.env.NODE_ENV === "development" || process.env.DEBUG_TASK_MENTION === "1") {
      console.info("[Notification] 업무 본문 호출 알림 (TASK_BODY_MENTION)", { userId });
    }
  } catch (e) {
    console.warn("[Notification] TASK_BODY_MENTION 실패 → BOARD_MENTION 폴백:", e);
    await createNotificationWithOptions({
      userId,
      type: "BOARD_MENTION",
      message,
      link,
      actorId,
    });
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
        deletedAt: null,
        isCompleted: false,
        dueDate: { gte: todayStart, lte: tomorrowEnd },
        OR: [{ assignedToId: { not: null } }, { assignees: { some: { userId: { not: "" } } } }],
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        assignedToId: true,
        assignees: { select: { userId: true } },
      },
    });

    if (tasks.length === 0) return;

    const taskLinks = tasks.map((t) => `/tasks/${t.id}`);
    const existingNotifications = await prisma.notification.findMany({
      where: {
        type: "DEADLINE",
        link: { in: taskLinks },
        createdAt: { gte: todayStart, lte: tomorrowEnd },
      },
      select: { link: true, userId: true },
    });
    const existingUserLinkSet = new Set(existingNotifications.map((n) => `${n.userId}|${n.link}`));

    for (const task of tasks) {
      if (!task.dueDate) continue;
      const recipientIds = [
        ...(task.assignedToId ? [task.assignedToId] : []),
        ...task.assignees.map((a) => a.userId),
      ];
      const userIds = [...new Set(recipientIds)].filter(Boolean);
      if (userIds.length === 0) continue;

      const dueDateStr = task.dueDate.toLocaleDateString("ko-KR", {
        month: "long",
        day: "numeric",
      });
      const isToday = startOfDay(new Date(task.dueDate)).getTime() === todayStart.getTime();
      const message = isToday
        ? `'${task.title}' 마감이 오늘입니다.`
        : `'${task.title}' 마감이 1일 남았습니다. (${dueDateStr})`;

      const link = `/tasks/${task.id}`;
      for (const uid of userIds) {
        const key = `${uid}|${link}`;
        if (existingUserLinkSet.has(key)) continue;
        await createNotification(uid, "DEADLINE", message, link);
      }
    }
  } catch (e) {
    console.error("[Notification] checkDeadlines 실패:", e);
  }
}

/**
 * 여러 수신자에게 동일한 알림을 한 번에 생성 (createMany 배치)
 * - DB INSERT는 1회, 푸시는 병렬 전송
 */
export async function createNotificationsForManyUsers(input: {
  userIds: string[];
  type: NotificationTypeEnum;
  message: string;
  link?: string;
  actorId?: string | null;
  /** true면 DB 알림만 저장하고 OneSignal은 호출하지 않음(호출부에서 배치 발송 등) */
  skipPush?: boolean;
}): Promise<void> {
  const { userIds, type, message, link = "", actorId = null, skipPush = false } = input;
  if (userIds.length === 0) return;

  // 1) DB 배치 INSERT
  try {
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({ userId, type, message, link })),
      skipDuplicates: true,
    });
  } catch (e) {
    console.error("[Notification] createMany 실패:", e);
  }

  // 2) 푸시 병렬 전송 (공지·다수 수신: 작성자 actorId에게는 발송하지 않음)
  const priority: NotificationPriority = DEFAULT_PRIORITY_BY_TYPE[type] ?? "medium";
  const shouldSendBatch =
    (priority === "high" || priority === "medium") &&
    userIds.some((uid) => actorId == null || uid !== actorId);
  const pushTargets =
    actorId == null ? userIds : userIds.filter((uid) => uid !== actorId);

  console.log("[Notification→push] createNotificationsForManyUsers", {
    type,
    userCount: userIds.length,
    pushTargetCount: pushTargets.length,
    actorId: actorId ?? null,
    shouldSendBatch,
  });

  if (skipPush) {
    console.log("[Notification→push] createNotificationsForManyUsers skipPush=true (외부에서 발송)");
  } else if (shouldSendBatch && pushTargets.length > 0) {
    await Promise.all(
      pushTargets.map((userId) =>
        sendPushToUser({ userId, title: "새 알림", message, url: link || undefined, priority }).catch((e) =>
          console.error("[Notification] push 실패:", userId, e)
        )
      )
    );
  }
}
