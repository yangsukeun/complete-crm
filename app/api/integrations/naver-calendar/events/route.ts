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
        const result = await fetchNaverCalDavEvents(
          { naverId: account.naverId, password },
          timeMin,
          timeMax
        );
        for (const event of result.events) {
          push(`${event.uid}|${event.start.getTime()}`, {
            id: `naver-${event.uid}-${event.start.getTime()}`,
            title: event.summary,
            start: event.start.toISOString(),
            end: event.end.toISOString(),
            isAllDay: event.isAllDay,
            source: "naver",
          });
        }

        // 성공한 빈 파싱(href는 있는데 본문 0)은 lastError로 남겨 진단 가능하게
        let lastError: string | null = null;
        if (result.hrefCount > 0 && result.icsBodyCount === 0) {
          lastError = `href ${result.hrefCount}건 중 본문 0건 회수 (calendar-multiget 실패 가능)`;
          warning = lastError;
          console.error("[NAVER_CALDAV]", {
            step: "events-route",
            hrefCount: result.hrefCount,
            icsBodyCount: result.icsBodyCount,
            eventCount: result.events.length,
          });
        }

        await prisma.naverCalDavAccount.update({
          where: { userId },
          data: { lastSyncedAt: new Date(), lastError },
        });
      } catch (err) {
        warning = err instanceof Error ? err.message : "네이버 캘린더 조회에 실패했습니다.";
        console.error("[naver-calendar/events] caldav", err);
        console.error("[NAVER_CALDAV]", {
          step: "events-route-catch",
          message: warning,
        });
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
    console.error("[NAVER_CALDAV]", {
      step: "events-route-fatal",
      message: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "네이버 일정 조회에 실패했습니다." }, { status: 500 });
  }
}
