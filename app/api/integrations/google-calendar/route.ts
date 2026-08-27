import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { isExecutiveOrAdmin } from "@/lib/role-access";
import {
  buildGoogleOAuthAuthUrl,
  googleOauthScopesForRole,
  hasGoogleTasksScope,
} from "@/lib/google-oauth";

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
    const authUrl = clientId
      ? buildGoogleOAuthAuthUrl(clientId, googleOauthScopesForRole(session.user.role))
      : null;
    if (!integration && clientId) {
      return NextResponse.json({ connected: false, authUrl, needsTasksReauth: false });
    }
    const needsTasksReauth = Boolean(
      integration &&
        isExecutiveOrAdmin(session.user.role) &&
        !hasGoogleTasksScope(integration.oauthScopes)
    );
    return NextResponse.json({
      connected: !!integration,
      needsTasksReauth,
      authUrl: needsTasksReauth ? authUrl : undefined,
    });
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
