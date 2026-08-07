import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

/**
 * Google all-day `YYYY-MM-DD` → KST 자정(UTC Date).
 * `new Date("YYYY-MM-DD")` 는 UTC 자정이라 KST에서 +9h 밀림 → 명시적 +09:00 사용.
 */
function parseGoogleAllDayStartKst(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+09:00`);
}

/**
 * Google all-day end.date 는 exclusive(마지막 날의 다음 날).
 * inclusive 마지막 시각 = exclusive 날짜 KST 자정 - 1ms.
 */
function parseGoogleAllDayEndInclusiveKst(exclusiveYmd: string): Date {
  return new Date(parseGoogleAllDayStartKst(exclusiveYmd).getTime() - 1);
}

async function getValidAccessToken(userId: string): Promise<string | null> {
  const row = await prisma.googleCalendarIntegration.findUnique({
    where: { userId },
  });
  if (!row) return null;
  const now = new Date();
  if (row.expiresAt && row.expiresAt > now) {
    return row.accessToken;
  }
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

/** 구글 캘린더 이벤트 조회 (timeMin, timeMax ISO 문자열) */
export async function GET(req: NextRequest) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const timeMin = req.nextUrl.searchParams.get("timeMin");
    const timeMax = req.nextUrl.searchParams.get("timeMax");
    if (!timeMin || !timeMax) {
      return NextResponse.json({ error: "timeMin, timeMax required" }, { status: 400 });
    }
    const accessToken = await getValidAccessToken(session.user.id);
    if (!accessToken) {
      return NextResponse.json({ error: "Google Calendar not connected" }, { status: 401 });
    }
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
    });
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!res.ok) {
      const err = await res.text();
      console.error("Google Calendar API error", err);
      return NextResponse.json({ error: "Failed to fetch Google events" }, { status: 502 });
    }
    const data = (await res.json()) as {
      items?: Array<{
        id: string;
        summary?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }>;
    };
    const events = (data.items ?? []).map((e) => {
      const timed = Boolean(e.start?.dateTime);
      let start: Date;
      let end: Date;
      if (timed) {
        start = new Date(e.start!.dateTime!);
        end = e.end?.dateTime
          ? new Date(e.end.dateTime)
          : new Date(start.getTime() + 3600000);
      } else {
        // all-day: end.date exclusive → inclusive (하루 빼기 / -1ms)
        start = e.start?.date
          ? parseGoogleAllDayStartKst(e.start.date)
          : new Date();
        if (e.end?.date) {
          end = parseGoogleAllDayEndInclusiveKst(e.end.date);
        } else {
          end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
        }
        if (end.getTime() < start.getTime()) {
          end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
        }
      }
      return {
        id: `google-${e.id}`,
        title: e.summary ?? "(제목 없음)",
        start: start.toISOString(),
        end: end.toISOString(),
        isAllDay: !timed,
        source: "google" as const,
      };
    });
    return NextResponse.json(events);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Google Calendar fetch failed" }, { status: 500 });
  }
}
