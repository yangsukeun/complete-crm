import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { saveOneSignalIdsToUser } from "@/lib/onesignal/save-player-to-user";
import { transferOneSignalSubscriptionToExternalId } from "@/lib/onesignal/transfer-subscription-external-id";
/**
 * 클라이언트 OneSignal 구독 ID를 User에 저장 (디버그·대시보드 Player ID와 대조).
 * 발송 시 `include_subscription_ids`(DB) 우선, 없으면 `include_aliases.external_id`.
 * SDK `login()` 미사용 시 anonymous 구독이 남을 수 있어, 저장 직후 Transfer API로 external_id 를 연결합니다.
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

    /** 기기별로 달라야 하는 값은 Push 구독 ID뿐. onesignalUserId 는 유저 단위라 여러 기기에 동일 → playerIds 가 1개로만 남는 원인 */
    const store = subscriptionId || null;

    console.log("[OneSignal register API] ⑥ DB 저장 요청", {
      userId: session.user.id,
      subscriptionId: subscriptionId || "(없음)",
      onesignalUserId: onesignalUserId || "(없음, DB 미저장)",
      externalIdReport: externalIdReport || "(없음)",
      storeLen: store?.length ?? 0,
    });

    if (!store) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "subscription_id_required",
        hint: "PushSubscription.id(구독 ID)가 준비된 뒤에 다시 호출하세요. onesignalUserId 만으로는 저장하지 않습니다.",
      });
    }

    await saveOneSignalIdsToUser(session.user.id, store);
    console.log("[OneSignal register API] ⑦ DB 반영 완료", { userId: session.user.id });

    const link = await transferOneSignalSubscriptionToExternalId(store, session.user.id);
    if (!link.ok) {
      console.warn("[OneSignal register API] external_id 연결(Transfer) 실패 — 푸시는 DB 구독 ID로만 시도됨", {
        userId: session.user.id,
        status: link.status,
        detail: link.detail?.slice(0, 200),
      });
    }

    return NextResponse.json({
      ok: true,
      savedSubscriptionId: true,
      oneSignalExternalLinked: link.ok,
    });
  } catch (e) {
    console.error("[OneSignal register API] 예외 (500 원인 확인)", e);
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "저장 실패", details: process.env.NODE_ENV === "development" ? detail : undefined },
      { status: 500 }
    );
  }
}
