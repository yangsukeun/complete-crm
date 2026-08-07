import { NextResponse } from "next/server";
import { addDays } from "date-fns";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { addDaysKstYmd, kstDateBoundsUtc, todayYmdKst } from "@/lib/date-kst";
import { listScheduleStandaloneTasks } from "@/lib/schedule-standalone-tasks";
import { getServerWorkspaceScopeFromRequest } from "@/lib/workspace";

export const runtime = "nodejs";

async function getGoogleAccessToken(userId: string): Promise<string | null> {
  const row = await prisma.googleCalendarIntegration.findUnique({ where: { userId } });
  if (!row) return null;
  const now = new Date();
  if (row.expiresAt && row.expiresAt > now) return row.accessToken;
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!row.refreshToken || !clientId || !clientSecret) return row.accessToken;

  const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!refreshRes.ok) return null;
  const data = (await refreshRes.json()) as { access_token: string; expires_in?: number };
  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
  await prisma.googleCalendarIntegration.update({
    where: { userId },
    data: { accessToken: data.access_token, expiresAt },
  });
  return data.access_token;
}

type BriefSchedule = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  source: "crm" | "google";
};

type BriefTask = {
  id: string;
  title: string;
  dueDate: string | null;
  isCompleted: boolean;
  assignees?: { id: string; name: string; position?: string | null }[];
  assignedTo: { id?: string; name: string; position?: string | null } | null;
};

type BriefProject = {
  id: string;
  name: string;
  dueDate: string;
  brandName: string | null;
};

/** 대시보드 오늘의 브리핑 — 세션 사용자 기준 1회 호출 */
export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const scope = await getServerWorkspaceScopeFromRequest(req);
    const ymd = todayYmdKst();
    const { start: dayStart, end: dayEnd } = kstDateBoundsUtc(ymd);
    const d3End = kstDateBoundsUtc(addDaysKstYmd(ymd, 3)).end;

    const [crmSchedules, standaloneTasks, projects, googleToken, projectsWithDueCount] =
      await Promise.all([
        prisma.schedule.findMany({
          where: {
            userId,
            OR: [
              { startTime: { gte: dayStart, lt: dayEnd } },
              {
                AND: [{ startTime: { lt: dayEnd } }, { endTime: { gt: dayStart } }],
              },
            ],
          },
          orderBy: { startTime: "asc" },
          select: {
            id: true,
            title: true,
            startTime: true,
            endTime: true,
            isAllDay: true,
          },
        }),
        // 스케줄 페이지 할일 목록과 동일 필터
        listScheduleStandaloneTasks(
          {
            id: userId,
            email: session.user.email,
            role: session.user.role,
          },
          scope,
          100
        ),
        // 본인 담당: 지연(마감 경과) + D-3 임박
        prisma.project.findMany({
          where: {
            deletedAt: null,
            status: { not: "COMPLETED" },
            dueDate: { not: null, lt: d3End },
            users: { some: { id: userId } },
          },
          orderBy: { dueDate: "asc" },
          take: 50,
          select: {
            id: true,
            name: true,
            dueDate: true,
            brand: { select: { name: true } },
          },
        }),
        getGoogleAccessToken(userId),
        prisma.project.count({
          where: {
            deletedAt: null,
            status: { not: "COMPLETED" },
            dueDate: { not: null },
            users: { some: { id: userId } },
          },
        }),
      ]);

    const schedules: BriefSchedule[] = crmSchedules.map((s) => ({
      id: s.id,
      title: s.title,
      start: s.startTime.toISOString(),
      end: s.endTime.toISOString(),
      allDay: s.isAllDay,
      source: "crm" as const,
    }));

    if (googleToken) {
      try {
        const params = new URLSearchParams({
          timeMin: dayStart.toISOString(),
          timeMax: dayEnd.toISOString(),
          singleEvents: "true",
          orderBy: "startTime",
        });
        const gRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
          { headers: { Authorization: `Bearer ${googleToken}` } }
        );
        if (gRes.ok) {
          const data = (await gRes.json()) as {
            items?: Array<{
              id: string;
              summary?: string;
              start?: { dateTime?: string; date?: string };
              end?: { dateTime?: string; date?: string };
            }>;
          };
          for (const e of data.items ?? []) {
            const timed = Boolean(e.start?.dateTime);
            let start: Date;
            let end: Date;
            let allDay = false;
            if (timed) {
              start = new Date(e.start!.dateTime!);
              end = e.end?.dateTime ? new Date(e.end.dateTime) : addDays(start, 0);
            } else if (e.start?.date) {
              allDay = true;
              start = new Date(`${e.start.date}T00:00:00+09:00`);
              const exclusive = e.end?.date
                ? new Date(`${e.end.date}T00:00:00+09:00`)
                : addDays(start, 1);
              end = new Date(exclusive.getTime() - 1);
              if (end < dayStart || start >= dayEnd) continue;
            } else {
              continue;
            }
            schedules.push({
              id: `google-${e.id}`,
              title: e.summary ?? "(제목 없음)",
              start: start.toISOString(),
              end: end.toISOString(),
              allDay,
              source: "google",
            });
          }
        }
      } catch (err) {
        console.warn("[dashboard/brief] google events skip", err);
      }
    }

    schedules.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return new Date(a.start).getTime() - new Date(b.start).getTime();
    });

    const briefTasks: BriefTask[] = standaloneTasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate?.toISOString() ?? null,
      isCompleted: t.isCompleted,
      assignees: t.assignees.map((a) => a.user),
      assignedTo: t.assignedTo,
    }));

    const briefProjects: BriefProject[] = projects
      .filter((p): p is typeof p & { dueDate: Date } => p.dueDate != null)
      .map((p) => ({
        id: p.id,
        name: p.name,
        dueDate: p.dueDate.toISOString(),
        brandName: p.brand?.name ?? null,
      }));

    const overdueProjects = briefProjects.filter((p) => new Date(p.dueDate) < dayStart).length;
    const soonProjects = briefProjects.length - overdueProjects;

    return NextResponse.json({
      dateYmd: ymd,
      schedules,
      tasks: briefTasks,
      projects: briefProjects,
      projectMeta: {
        overdue: overdueProjects,
        soon: soonProjects,
        /** 담당 프로젝트 중 dueDate가 하나라도 있는지 (상시 구역만 있으면 0) */
        withDueDate: projectsWithDueCount,
      },
    });
  } catch (e) {
    console.error("[GET /api/dashboard/brief]", e);
    return NextResponse.json({ error: "brief failed" }, { status: 500 });
  }
}
