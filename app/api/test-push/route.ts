import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { sendPushToUser } from "@/lib/notifications/push";

export const runtime = "nodejs";

/**
 * 로그인 사용자 본인에게 테스트 웹 푸시 (OneSignal).
 */
export async function POST() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    await sendPushToUser({
      userId: session.user.id,
      title: "테스트 알림",
      message: "OneSignal 푸시가 정상이면 이 메시지가 보입니다.",
      url: "/notifications",
      priority: "high",
      data: { type: "test_push", ts: Date.now() },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[test-push]", e);
    return NextResponse.json({ error: "테스트 푸시 요청 실패" }, { status: 500 });
  }
}
