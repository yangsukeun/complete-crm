import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { isOneSignalServerDebug } from "@/lib/onesignal-debug";

/**
 * 클라이언트 OneSignal 구독 ID를 User에 저장 (디버그·대시보드 Player ID와 대조).
 * 실제 발송은 REST의 include_aliases.external_id (= User.id)로 이루어짐.
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

    if (isOneSignalServerDebug()) {
      console.log("[OneSignal register API] ⑥ DB 저장 요청", {
        userId: session.user.id,
        subscriptionId: subscriptionId || "(없음)",
        onesignalUserId: onesignalUserId || "(없음)",
        externalIdReport: externalIdReport || "(없음)",
      });
    }

    if (store) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { oneSignalPlayerId: store },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[OneSignal register API]", e);
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }
}
