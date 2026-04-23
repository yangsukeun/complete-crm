import prisma from "@/lib/prisma";
import { cancelOneSignalPush, syncBadgeCount } from "@/lib/onesignal/cancel";

export type NotificationRelatedType =
  | "PROJECT"
  | "TASK"
  | "CHAT"
  | "LEAVE"
  | "ATTENDANCE"
  | "FINANCE"
  | "BOARD"
  | "NOTICE"
  | "WORK_LOG"
  | "SYSTEM";

export type AutoReadNotificationsInput =
  | { userId: string; all: true }
  | { userId: string; notificationIds: string[] }
  | {
      userId: string;
      relatedType: NotificationRelatedType;
      relatedId?: string | null;
      /** Notification.type 필터(선택) */
      types?: string[];
      /** 백필 중 fallback: link 문자열 매칭(선택) */
      linkFallback?: string[];
    };

export type AutoReadNotificationsResult = {
  matched: number;
  updated: number;
  cancelledPush: number;
  unreadCountAfter: number;
};

function uniqStrings(xs: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function buildWhere(input: AutoReadNotificationsInput) {
  const base: any = { userId: input.userId, isRead: false };
  if ("all" in input && input.all) return base;

  if ("notificationIds" in input) {
    const ids = uniqStrings(input.notificationIds);
    return { ...base, id: { in: ids.length > 0 ? ids : ["__none__"] } };
  }

  // relatedType 기반 경로
  if (!("relatedType" in input)) {
    return base;
  }

  const types = "types" in input && input.types ? uniqStrings(input.types) : [];
  const links = "linkFallback" in input && input.linkFallback ? uniqStrings(input.linkFallback) : [];

  const relatedType = input.relatedType;
  const relatedId =
    input.relatedId === undefined ? undefined : input.relatedId === null ? null : String(input.relatedId);

  // relatedId를 안 주면 relatedType 단위(/leave 같은 목록 링크)로 처리
  const relatedClause =
    relatedId === undefined
      ? { relatedType }
      : { relatedType, relatedId: relatedId === null ? null : relatedId };

  const and: any[] = [relatedClause];
  if (types.length > 0) and.push({ type: { in: types } });

  // 백필 전/실패 시: link 매칭 병행
  if (links.length > 0) {
    return {
      ...base,
      OR: [{ AND: and }, { link: { in: links } }],
    };
  }

  return { ...base, AND: and };
}

export async function autoReadNotifications(
  input: AutoReadNotificationsInput
): Promise<AutoReadNotificationsResult> {
  const where = buildWhere(input);
  const now = new Date();

  // 1) 대상 조회(OneSignal 취소용)
  const targets = await prisma.notification.findMany({
    where,
    select: { id: true, oneSignalNotificationId: true },
  });

  // 2) DB 읽음 처리(readAt 포함)
  const updated = await prisma.notification.updateMany({
    where,
    data: { isRead: true, readAt: now },
  });

  // 3) OneSignal 취소(실패 허용)
  const osIds = targets
    .map((t) => t.oneSignalNotificationId)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  if (osIds.length > 0) {
    await Promise.allSettled(osIds.map((id) => cancelOneSignalPush(id)));
  }

  // 4) 배지 동기화
  const unreadCountAfter = await prisma.notification.count({
    where: { userId: input.userId, isRead: false },
  });
  await syncBadgeCount(input.userId, unreadCountAfter);

  return {
    matched: targets.length,
    updated: updated.count,
    cancelledPush: osIds.length,
    unreadCountAfter,
  };
}

