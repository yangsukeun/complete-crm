import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { naverCalendarOAuthConfigured } from "@/lib/naver-calendar-oauth";

export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const integration = await prisma.naverCalendarIntegration.findUnique({
      where: { userId: session.user.id },
    });
    const configured = naverCalendarOAuthConfigured();

    if (!integration && configured) {
      return NextResponse.json({
        connected: false,
        configured: true,
        authUrl: "/api/integrations/naver-calendar/auth",
      });
    }

    return NextResponse.json({ connected: !!integration, configured });
  } catch (e) {
    console.error("[naver-calendar] GET", e);
    return NextResponse.json({ connected: false, configured: false });
  }
}

export async function DELETE() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await prisma.naverCalendarIntegration.deleteMany({
      where: { userId: session.user.id },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[naver-calendar] DELETE", e);
    return NextResponse.json({ error: "연동 해제 실패" }, { status: 500 });
  }
}
