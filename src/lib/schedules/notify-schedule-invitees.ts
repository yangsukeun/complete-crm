import "server-only";

import prisma from "@/lib/prisma";
import { createNotificationWithOptions } from "@/lib/notifications";
import { findOrCreateDirectChat, sendChatMessageFromUser } from "@/lib/chats/direct-chat";

/** 알림/채팅 본문용: KST 기준 날짜·시간 문자열 */
export function formatScheduleDateTimeForNotification(
  start: Date,
  end: Date,
  isAllDay: boolean
): string {
  const tz = "Asia/Seoul";
  if (isAllDay) {
    return (
      new Intl.DateTimeFormat("ko-KR", {
        timeZone: tz,
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(start) + " (종일)"
    );
  }
  const datePart = new Intl.DateTimeFormat("ko-KR", {
    timeZone: tz,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(start);
  const hm = (d: Date) =>
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  return `${datePart} ${hm(start)}~${hm(end)}`;
}

/**
 * 일정 초대가 있는 참석자에게 CRM 알림(ASSIGNED) + 1:1 채팅 메시지.
 * ScheduleInvite 행은 호출 측에서 이미 생성한 뒤 호출.
 */
export async function notifyScheduleInviteesAfterCreate(params: {
  organizerId: string;
  inviteeUserIds: string[];
  scheduleTitle: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
}): Promise<void> {
  const { organizerId, inviteeUserIds, scheduleTitle, startTime, endTime, isAllDay } = params;
  const uniqueInvitees = [...new Set(inviteeUserIds)].filter((id) => id && id !== organizerId);
  if (uniqueInvitees.length === 0) return;

  const org = await prisma.user.findUnique({
    where: { id: organizerId },
    select: { name: true },
  });
  const organizerName = org?.name ?? "동료";
  const period = formatScheduleDateTimeForNotification(startTime, endTime, isAllDay);
  const notifMessage = `${organizerName}님이 ${period} 일정을 등록했습니다`;
  const chatBody = `${notifMessage}\n제목: ${scheduleTitle}`;

  await Promise.all(
    uniqueInvitees.map(async (toUserId) => {
      await createNotificationWithOptions({
        userId: toUserId,
        type: "ASSIGNED",
        message: notifMessage,
        link: "/schedule",
        actorId: organizerId,
      });
      try {
        const chatId = await findOrCreateDirectChat(organizerId, toUserId);
        await sendChatMessageFromUser({
          chatId,
          fromUserId: organizerId,
          body: chatBody,
        });
      } catch (e) {
        console.error("[notifyScheduleInvitees] 채팅 전송 실패:", toUserId, e);
      }
    })
  );
}
