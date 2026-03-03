import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

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
    const events = (data.items ?? []).map((e: any) => {
      const start = e.start?.dateTime ? new Date(e.start.dateTime) : e.start?.date ? new Date(e.start.date + "T00:00:00") : new Date();
      const end = e.end?.dateTime ? new Date(e.end.dateTime) : e.end?.date ? new Date(e.end.date + "T23:59:59") : new Date(start.getTime() + 3600000);
      return {
        id: `google-${e.id}`,
        title: e.summary ?? "(제목 없음)",
        start: start.toISOString(),
        end: end.toISOString(),
        isAllDay: !e.start?.dateTime,
        source: "google" as const,
      };
    });
    return NextResponse.json(events);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Google Calendar fetch failed" }, { status: 500 });
  }
}
