import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

const ONESIGNAL_V1_URL = "https://onesignal.com/api/v1/notifications";

function missingOneSignalEnvVars(): string[] {
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID?.trim()) missing.push("NEXT_PUBLIC_ONESIGNAL_APP_ID");
  const rest =
    process.env.ONESIGNAL_REST_API_KEY?.trim() || process.env.ONE_SIGNAL_REST_API_KEY?.trim();
  if (!rest) missing.push("ONESIGNAL_REST_API_KEY");
  return missing;
}

function basicAuthForOneSignal(restKey: string): string {
  const token = Buffer.from(`${restKey.trim()}:`, "utf8").toString("base64");
  return `Basic ${token}`;
}

async function resolveSubscriptionId(userId: string): Promise<string | null> {
  type Row = { oneSignalPlayerId: string | null; playerId?: string | null };
  let row: Row | null;
  try {
    row = await prisma.user.findUnique({
      where: { id: userId },
      select: { oneSignalPlayerId: true, playerId: true },
    });
  } catch (firstErr) {
    const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    if (/playerId|Unknown column|does not exist/i.test(msg)) {
      row = await prisma.user.findUnique({
        where: { id: userId },
        select: { oneSignalPlayerId: true },
      });
      row = row ? { ...row, playerId: null } : null;
    } else {
      throw firstErr;
    }
  }
  if (!row) return null;
  const sid = (row.playerId?.trim() || row.oneSignalPlayerId?.trim()) ?? "";
  return sid.length > 8 ? sid : null;
}

/**
 * GET/POST: 로그인 사용자 본인에게 테스트 웹 푸시.
 * OneSignal v1 엔드포인트에 `include_subscription_ids`로 직접 POST (대시보드 Delivered 검증용).
 */
async function handleTestPush() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const missing = missingOneSignalEnvVars();
    if (missing.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Vercel(또는 배포 환경) Project Settings → Environment Variables 에 OneSignal 값이 없습니다.",
          missing,
          requiredForPush: ["NEXT_PUBLIC_ONESIGNAL_APP_ID", "ONESIGNAL_REST_API_KEY"],
          note: "두 변수 모두 프로덕션·프리뷰 환경에 추가했는지 확인하세요. 앱 ID는 클라이언트, REST 키는 서버 전용입니다.",
        },
        { status: 503 }
      );
    }

    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID!.trim();
    const restKey =
      process.env.ONESIGNAL_REST_API_KEY?.trim() || process.env.ONE_SIGNAL_REST_API_KEY!.trim();

    const subscriptionId = await resolveSubscriptionId(session.user.id);
    if (!subscriptionId) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          error:
            "DB에 OneSignal 구독 ID가 없습니다. 브라우저에서 푸시 허용 후 앱이 playerId/oneSignalPlayerId를 저장했는지 확인하세요.",
          userId: session.user.id,
        },
        { status: 400 }
      );
    }

    console.log("[test-push] 직접 POST", ONESIGNAL_V1_URL, {
      userId: session.user.id,
    });
    console.log(`[Push] sending to subscriptionId: ${subscriptionId}`);

    const body = {
      app_id: appId,
      include_subscription_ids: [subscriptionId],
      contents: { en: "테스트 알림입니다", ko: "테스트 알림입니다" },
      headings: { en: "COMPLETE CRM", ko: "COMPLETE CRM" },
    };

    const res = await fetch(ONESIGNAL_V1_URL, {
      method: "POST",
      headers: {
        Authorization: basicAuthForOneSignal(restKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    console.log("[Push] OneSignal response:", text.length > 2000 ? `${text.slice(0, 2000)}…` : text);

    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = null;
    }

    const recipients = typeof parsed?.recipients === "number" ? parsed.recipients : null;
    const httpOk = res.ok;
    const sent = httpOk && (recipients === null ? true : recipients > 0);

    return NextResponse.json({
      ok: httpOk,
      sent,
      status: res.status,
      userId: session.user.id,
      subscriptionIdPreview: `${subscriptionId.slice(0, 6)}…`,
      oneSignal: parsed ?? { raw: text.slice(0, 500) },
      env: {
        hasNextPublicAppId: true,
        hasRestApiKey: true,
      },
      hint: "Delivered 0이면 구독 ID·앱 ID·REST Key( User Auth Key 아님 )·웹 푸시 설정을 확인하세요.",
    });
  } catch (e) {
    console.error("[test-push]", e);
    return NextResponse.json({ error: "테스트 푸시 요청 실패" }, { status: 500 });
  }
}

export async function GET() {
  return handleTestPush();
}

export async function POST() {
  return handleTestPush();
}
