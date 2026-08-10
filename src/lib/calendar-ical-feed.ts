import { randomBytes } from "crypto";
import prisma from "@/lib/prisma";
import { buildVcalendar, buildVevent } from "@/lib/ical-format";
import { leaveRequestTypeLabel } from "@/lib/leave/display-labels";
import { getAppBaseUrl } from "@/lib/naver-calendar-oauth";

function newIcalFeedToken(): string {
  return randomBytes(24).toString("hex");
}

export async function ensureIcalFeedToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { icalFeedToken: true },
  });
  if (user?.icalFeedToken) return user.icalFeedToken;

  for (let attempt = 0; attempt < 5; attempt++) {
    const token = newIcalFeedToken();
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { icalFeedToken: token },
      });
      return token;
    } catch {
      // unique collision — retry
    }
  }
  throw new Error("Failed to allocate iCal feed token");
}

export async function regenerateIcalFeedToken(userId: string): Promise<string> {
  const token = newIcalFeedToken();
  await prisma.user.update({
    where: { id: userId },
    data: { icalFeedToken: token },
  });
  return token;
}

export function buildIcalFeedPublicUrl(token: string): string {
  const base = getAppBaseUrl().replace(/\/$/, "");
  return `${base}/api/calendar/feed/${token}.ics`;
}

function defaultFeedRange(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 3, 1, 0, 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth() + 12, 0, 23, 59, 59, 999);
  return { from, to };
}

export async function buildUserIcalFeedBody(userId: string): Promise<string> {
  const { from, to } = defaultFeedRange();
  const rangeWhere = {
    startTime: { lte: to },
    endTime: { gte: from },
  };

  const [personalSchedules, teamSchedules, leaves] = await Promise.all([
    prisma.schedule.findMany({
      where: { userId, scope: "PERSONAL", ...rangeWhere },
      select: {
        id: true,
        title: true,
        description: true,
        startTime: true,
        endTime: true,
        isAllDay: true,
      },
    }),
    prisma.schedule.findMany({
      where: { userId, scope: "TEAM", ...rangeWhere },
      select: {
        id: true,
        title: true,
        description: true,
        startTime: true,
        endTime: true,
        isAllDay: true,
      },
    }),
    prisma.leaveRequest.findMany({
      where: {
        userId,
        status: "APPROVED",
        startDate: { lte: to },
        endDate: { gte: from },
      },
      select: {
        id: true,
        type: true,
        startDate: true,
        endDate: true,
        reason: true,
      },
    }),
  ]);

  const vevents = [
    ...personalSchedules.map((s) =>
      buildVevent({
        uid: `crm-schedule-${s.id}@cpcrm`,
        summary: `[개인] ${s.title}`,
        description: s.description,
        start: s.startTime,
        end: s.endTime,
        isAllDay: s.isAllDay,
      })
    ),
    ...teamSchedules.map((s) =>
      buildVevent({
        uid: `crm-team-schedule-${s.id}@cpcrm`,
        summary: `[팀] ${s.title}`,
        description: s.description,
        start: s.startTime,
        end: s.endTime,
        isAllDay: s.isAllDay,
      })
    ),
    ...leaves.map((l) =>
      buildVevent({
        uid: `crm-leave-${l.id}@cpcrm`,
        summary: `[휴가] ${leaveRequestTypeLabel(l.type)}`,
        description: l.reason,
        start: l.startDate,
        end: l.endDate,
        isAllDay: true,
      })
    ),
  ];

  return buildVcalendar(vevents);
}

export async function findUserIdByIcalFeedToken(token: string): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { icalFeedToken: token },
    select: { id: true },
  });
  return user?.id ?? null;
}
