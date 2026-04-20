import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { saveOneSignalIdsToUser } from "@/lib/onesignal/save-player-to-user";
import { isLikelyOneSignalSubscriptionId } from "@/lib/onesignal/subscription-id";
import { transferOneSignalSubscriptionToExternalId } from "@/lib/onesignal/transfer-subscription-external-id";
import { touchOneSignalSubscriptionLastSeen } from "@/lib/onesignal/subscription-last-seen";

/**
 * 별칭 엔드포인트: `/api/user/onesignal-register` 와 동일 목적.
 * body: `{ "playerId": "…" }` 또는 `{ "subscriptionId": "…" }` — 반드시 Push 구독 ID(기기별).
 */
export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      playerId?: string;
      subscriptionId?: string;
    };
    const raw =
      (typeof body.subscriptionId === "string" ? body.subscriptionId : "") ||
      (typeof body.playerId === "string" ? body.playerId : "");
    const playerId = raw.trim();

    if (!playerId || playerId.length < 8) {
      return NextResponse.json({ error: "playerId or subscriptionId required" }, { status: 400 });
    }
    if (!isLikelyOneSignalSubscriptionId(playerId)) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_subscription_id_format",
          hint: "OneSignal 구독 ID는 UUID 형식이어야 합니다.",
        },
        { status: 400 }
      );
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { playerIds: true },
      });
      if (user?.playerIds?.includes(playerId)) {
        void transferOneSignalSubscriptionToExternalId(playerId, session.user.id);
        await touchOneSignalSubscriptionLastSeen(session.user.id, playerId);
        return NextResponse.json({ ok: true, alreadyRegistered: true });
      }
    } catch {
      /* playerIds 컬럼 없으면 생략 */
    }

    await saveOneSignalIdsToUser(session.user.id, playerId);
    const link = await transferOneSignalSubscriptionToExternalId(playerId, session.user.id);
    return NextResponse.json({ ok: true, oneSignalExternalLinked: link.ok });
  } catch (e) {
    console.error("[onesignal/register]", e);
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }
}
