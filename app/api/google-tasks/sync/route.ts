import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { isExecutiveOrAdmin } from "@/lib/role-access";
import {
  buildGoogleOAuthAuthUrl,
  googleOauthScopesForRole,
  hasGoogleTasksScope,
} from "@/lib/google-oauth";
import { GoogleTasksAuthError, syncGoogleTasksToCrm } from "@/lib/google-tasks-sync";

export const runtime = "nodejs";

function statusPayload(opts: {
  enabled: boolean;
  connected?: boolean;
  needsReauth?: boolean;
  lastSyncedAt?: string | null;
  authUrl?: string | null;
}) {
  return opts;
}

/** GET: 대표만 enabled. 직원은 버튼 노출 판단용 { enabled: false } */
export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isExecutiveOrAdmin(session.user.role)) {
      return NextResponse.json(statusPayload({ enabled: false }));
    }
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
    const integration = await prisma.googleCalendarIntegration.findUnique({
      where: { userId: session.user.id },
      select: { oauthScopes: true, googleTasksSyncedAt: true },
    });
    const authUrl = clientId
      ? buildGoogleOAuthAuthUrl(clientId, googleOauthScopesForRole(session.user.role))
      : null;
    if (!integration) {
      return NextResponse.json(
        statusPayload({
          enabled: true,
          connected: false,
          needsReauth: false,
          lastSyncedAt: null,
          authUrl,
        })
      );
    }
    const needsReauth = !hasGoogleTasksScope(integration.oauthScopes);
    return NextResponse.json(
      statusPayload({
        enabled: true,
        connected: true,
        needsReauth,
        lastSyncedAt: integration.googleTasksSyncedAt?.toISOString() ?? null,
        authUrl,
      })
    );
  } catch (e) {
    console.error("[google-tasks] GET", e);
    return NextResponse.json(statusPayload({ enabled: false }));
  }
}

/** POST: 구글 Tasks → CRM 증분 동기화. ?force=1 이면 10분 쿨다운 무시(수동 버튼) */
export async function POST(req: NextRequest) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isExecutiveOrAdmin(session.user.role)) {
      return NextResponse.json({ error: "대표 계정만 구글 할일을 가져올 수 있습니다." }, { status: 403 });
    }
    const force = req.nextUrl.searchParams.get("force") === "1";
    const result = await syncGoogleTasksToCrm({ userId: session.user.id, force });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof GoogleTasksAuthError) {
      return NextResponse.json({ error: e.message, needsReauth: true }, { status: 401 });
    }
    console.error("[google-tasks] POST", e);
    const msg = e instanceof Error ? e.message : "동기화에 실패했습니다.";
    return NextResponse.json({ error: msg.length < 400 ? msg : "동기화에 실패했습니다." }, { status: 500 });
  }
}
