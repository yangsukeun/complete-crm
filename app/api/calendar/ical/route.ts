import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import {
  buildIcalFeedPublicUrl,
  ensureIcalFeedToken,
  regenerateIcalFeedToken,
} from "@/lib/calendar-ical-feed";

export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = await ensureIcalFeedToken(session.user.id);
    return NextResponse.json({
      feedUrl: buildIcalFeedPublicUrl(token),
      webcalUrl: buildIcalFeedPublicUrl(token).replace(/^https?:/, "webcal:"),
    });
  } catch (e) {
    console.error("[calendar/ical] GET", e);
    return NextResponse.json({ error: "구독 URL을 불러올 수 없습니다." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "regenerate") {
      return NextResponse.json({ error: "action=regenerate 필요" }, { status: 400 });
    }
    const token = await regenerateIcalFeedToken(session.user.id);
    return NextResponse.json({
      feedUrl: buildIcalFeedPublicUrl(token),
      webcalUrl: buildIcalFeedPublicUrl(token).replace(/^https?:/, "webcal:"),
    });
  } catch (e) {
    console.error("[calendar/ical] POST", e);
    return NextResponse.json({ error: "URL 재발급에 실패했습니다." }, { status: 500 });
  }
}
