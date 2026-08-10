import { NextResponse } from "next/server";
import { buildUserIcalFeedBody, findUserIdByIcalFeedToken } from "@/lib/calendar-ical-feed";

type Params = { params: Promise<{ token: string }> };

/** 공개 iCal 구독 피드 — URL 토큰으로만 접근 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { token: raw } = await params;
    const token = raw.replace(/\.ics$/i, "");
    if (!token || token.length < 16) {
      return new NextResponse("Not found", { status: 404 });
    }

    const userId = await findUserIdByIcalFeedToken(token);
    if (!userId) {
      return new NextResponse("Not found", { status: 404 });
    }

    const body = await buildUserIcalFeedBody(userId);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    console.error("[calendar/feed] GET", e);
    return new NextResponse("Internal error", { status: 500 });
  }
}
