import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { decryptSecret } from "@/lib/secret-box";
import { fetchNaverCalDavEvents } from "@/lib/naver-caldav";

export const runtime = "nodejs";

type NaverEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  source: "naver";
};

/** CalDAV 실시간 조회 + 업로드된 .ics 스냅샷을 합쳐서 반환 */
export async function GET(req: NextRequest) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const timeMinRaw = req.nextUrl.searchParams.get("timeMin");
    const timeMaxRaw = req.nextUrl.searchParams.get("timeMax");
    if (!timeMinRaw || !timeMaxRaw) {
      return NextResponse.json({ error: "timeMin, timeMax required" }, { status: 400 });
    }
    const timeMin = new Date(timeMinRaw);
    const timeMax = new Date(timeMaxRaw);
    if (Number.isNaN(timeMin.getTime()) || Number.isNaN(timeMax.getTime())) {
      return NextResponse.json({ error: "timeMin, timeMax must be ISO dates" }, { status: 400 });
    }

    const userId = session.user.id;
    const events: NaverEvent[] = [];
    const seen = new Set<string>();

    const push = (key: string, event: NaverEvent) => {
      if (seen.has(key)) return;
      seen.add(key);
      events.push(event);
    };

    const account = await prisma.naverCalDavAccount.findUnique({ where: { userId } });
    let warning: string | null = null;

    if (account) {
      try {
        const password = decryptSecret(account.passwordCipher);
        const caldavEvents = await fetchNaverCalDavEvents(
          { naverId: account.naverId, password },
          timeMin,
          timeMax
        );
        for (const event of caldavEvents) {
          push(`${event.uid}|${event.start.getTime()}`, {
            id: `naver-${event.uid}-${event.start.getTime()}`,
            title: event.summary,
            start: event.start.toISOString(),
            end: event.end.toISOString(),
            isAllDay: event.isAllDay,
            source: "naver",
          });
        }
        await prisma.naverCalDavAccount.update({
          where: { userId },
          data: { lastSyncedAt: new Date(), lastError: null },
        });
      } catch (err) {
        warning = err instanceof Error ? err.message : "네이버 캘린더 조회에 실패했습니다.";
        console.error("[naver-calendar/events] caldav", err);
        await prisma.naverCalDavAccount
          .update({ where: { userId }, data: { lastError: warning } })
          .catch(() => undefined);
      }
    }

    const imported = await prisma.externalCalendarEvent.findMany({
      where: {
        userId,
        source: "naver_ics",
        startTime: { lt: timeMax },
        endTime: { gt: timeMin },
      },
      orderBy: { startTime: "asc" },
      take: 2000,
    });

    for (const row of imported) {
      push(`${row.uid}|${row.startTime.getTime()}`, {
        id: `naver-ics-${row.id}`,
        title: row.title,
        start: row.startTime.toISOString(),
        end: row.endTime.toISOString(),
        isAllDay: row.isAllDay,
        source: "naver",
      });
    }

    events.sort((a, b) => a.start.localeCompare(b.start));
    return NextResponse.json({ events, warning });
  } catch (e) {
    console.error("[naver-calendar/events] GET", e);
    return NextResponse.json({ error: "네이버 일정 조회에 실패했습니다." }, { status: 500 });
  }
}
