import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { saveOneSignalIdsToUser } from "@/lib/onesignal/save-player-to-user";
/**
 * 클라이언트 OneSignal 구독 ID를 User에 저장 (디버그·대시보드 Player ID와 대조).
 * 발송 시 REST는 include_aliases.external_id 와 DB에 저장된 구독 ID(include_subscription_ids)를 함께 사용합니다.
 */
export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      subscriptionId?: string;
      onesignalUserId?: string;
      externalId?: string;
    };

    const subscriptionId =
      typeof body.subscriptionId === "string" ? body.subscriptionId.trim() : "";
    const onesignalUserId =
      typeof body.onesignalUserId === "string" ? body.onesignalUserId.trim() : "";
    const externalIdReport = typeof body.externalId === "string" ? body.externalId.trim() : "";

    const store = subscriptionId || onesignalUserId || null;

    console.log("[OneSignal register API] ⑥ DB 저장 요청", {
      userId: session.user.id,
      subscriptionId: subscriptionId || "(없음)",
      onesignalUserId: onesignalUserId || "(없음)",
      externalIdReport: externalIdReport || "(없음)",
      storeLen: store?.length ?? 0,
    });

    if (store) {
      await saveOneSignalIdsToUser(session.user.id, store);
      console.log("[OneSignal register API] ⑦ DB 반영 완료", { userId: session.user.id });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[OneSignal register API] 예외 (500 원인 확인)", e);
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "저장 실패", details: process.env.NODE_ENV === "development" ? detail : undefined },
      { status: 500 }
    );
  }
}
