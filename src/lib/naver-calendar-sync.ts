import prisma from "@/lib/prisma";
import { leaveRequestTypeLabel } from "@/lib/leave/display-labels";
import { buildIcalStringForNaver, type IcalEventInput } from "@/lib/ical-format";
import { getValidNaverAccessToken } from "@/lib/naver-calendar-oauth";

const NAVER_CREATE_URL = "https://openapi.naver.com/calendar/createSchedule.json";

export type ScheduleSyncInput = {
  id: string;
  title: string;
  description?: string | null;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  scope?: string;
};

export type LeaveSyncInput = {
  id: string;
  type: string;
  startDate: Date;
  endDate: Date;
  reason?: string | null;
};

function scheduleUid(scheduleId: string): string {
  return `crm-schedule-${scheduleId}@cpcrm`;
}

function leaveUid(leaveId: string): string {
  return `crm-leave-${leaveId}@cpcrm`;
}

function toIcalEventFromSchedule(s: ScheduleSyncInput): IcalEventInput {
  const prefix = s.scope === "PERSONAL" ? "[개인] " : "[팀] ";
  return {
    uid: scheduleUid(s.id),
    summary: `${prefix}${s.title}`,
    description: s.description,
    start: s.startTime,
    end: s.endTime,
    isAllDay: s.isAllDay,
  };
}

function toIcalEventFromLeave(l: LeaveSyncInput): IcalEventInput {
  const label = leaveRequestTypeLabel(l.type);
  return {
    uid: leaveUid(l.id),
    summary: `[휴가] ${label}`,
    description: l.reason,
    start: l.startDate,
    end: l.endDate,
    isAllDay: true,
  };
}

async function pushIcalToNaver(userId: string, icalString: string): Promise<void> {
  const accessToken = await getValidNaverAccessToken(userId);
  if (!accessToken) return;

  const res = await fetch(NAVER_CREATE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      calendarId: "defaultCalendarId",
      scheduleIcalString: icalString,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[naver-calendar] createSchedule failed", { userId, status: res.status, text });
  }
}

export async function syncScheduleToNaverCalendar(
  userId: string,
  schedule: ScheduleSyncInput
): Promise<void> {
  try {
    const connected = await prisma.naverCalendarIntegration.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!connected) return;
    const ical = buildIcalStringForNaver(toIcalEventFromSchedule(schedule));
    await pushIcalToNaver(userId, ical);
  } catch (err) {
    console.error("[naver-calendar] syncSchedule failed", { userId, scheduleId: schedule.id, err });
  }
}

export async function syncLeaveToNaverCalendar(userId: string, leave: LeaveSyncInput): Promise<void> {
  try {
    const connected = await prisma.naverCalendarIntegration.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!connected) return;
    const ical = buildIcalStringForNaver(toIcalEventFromLeave(leave));
    await pushIcalToNaver(userId, ical);
  } catch (err) {
    console.error("[naver-calendar] syncLeave failed", { userId, leaveId: leave.id, err });
  }
}
