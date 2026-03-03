import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

/** 연동 상태 조회: connected, authUrl(미연동 시) */
export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const integration = await prisma.googleCalendarIntegration.findUnique({
      where: { userId: session.user.id },
    });
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    if (!integration && clientId) {
      const base =
        process.env.NEXTAUTH_URL ??
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      const redirectUri = `${base}/api/integrations/google-calendar/callback`;
      const scope = encodeURIComponent("https://www.googleapis.com/auth/calendar.events.readonly");
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
      return NextResponse.json({ connected: false, authUrl });
    }
    return NextResponse.json({ connected: !!integration });
  } catch (e) {
    console.error("[google-calendar] GET", e);
    // DB/테이블 미준비 등으로 실패해도 페이지는 동작하도록 200 + connected: false
    return NextResponse.json({ connected: false });
  }
}

/** 연동 해제 */
export async function DELETE() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await prisma.googleCalendarIntegration.deleteMany({
      where: { userId: session.user.id },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "연동 해제 실패" }, { status: 500 });
  }
}
