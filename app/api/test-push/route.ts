import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { sendPushToUser } from "@/lib/notifications/push";

export const runtime = "nodejs";

function missingOneSignalEnvVars(): string[] {
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID?.trim()) missing.push("NEXT_PUBLIC_ONESIGNAL_APP_ID");
  const rest =
    process.env.ONESIGNAL_REST_API_KEY?.trim() || process.env.ONE_SIGNAL_REST_API_KEY?.trim();
  if (!rest) missing.push("ONESIGNAL_REST_API_KEY");
  return missing;
}

/**
 * GET/POST: 로그인 사용자 본인에게 테스트 웹 푸시 (OneSignal).
 * GET은 브라우저 주소창·북마크로 빠르게 점검할 때 사용.
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

    console.log("[test-push] GET: 즉시 OneSignal REST 호출 (sendPushToUser → api.onesignal.com / 레거시 폴백)", {
      userId: session.user.id,
    });

    await sendPushToUser({
      userId: session.user.id,
      title: "테스트 알림",
      message: "OneSignal 푸시가 정상이면 이 메시지가 보입니다.",
      url: "/notifications",
      priority: "high",
      data: { type: "test_push", ts: Date.now() },
    });

    return NextResponse.json({
      ok: true,
      sent: true,
      userId: session.user.id,
      env: {
        hasNextPublicAppId: true,
        hasRestApiKey: true,
      },
      hint: "Vercel 로그에서 [Push] sending… / [Push] OneSignal response… 검색",
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
