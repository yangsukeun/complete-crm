import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { saveOneSignalIdsToUser } from "@/lib/onesignal/save-player-to-user";
import { isLikelyOneSignalSubscriptionId } from "@/lib/onesignal/subscription-id";
import { transferOneSignalSubscriptionToExternalId } from "@/lib/onesignal/transfer-subscription-external-id";
import { deleteOneSignalSubscriptionRows } from "@/lib/onesignal/subscription-last-seen";
import { deleteOneSignalSubscriptionRemote } from "@/lib/onesignal/delete-subscription-remote";
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

    if (!isLikelyOneSignalSubscriptionId(store)) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "invalid_subscription_id_format",
        hint: "구독 ID는 OneSignal이 부여한 UUID 형식이어야 합니다. 푸시 토큰 문자열은 구독 ID가 아닙니다. 잠시 후 SDK에서 id가 채워지면 자동으로 재시도됩니다.",
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

function isMissingPushColumnsError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    msg.includes("playerids") ||
    msg.includes("playersids") ||
    msg.includes("oneSignalPlayerId".toLowerCase()) ||
    msg.includes("playerid") ||
    (msg.includes("unknown arg") && (msg.includes("player") || msg.includes("onesignal"))) ||
    (msg.includes("column") && msg.includes("does not exist") && (msg.includes("player") || msg.includes("onesignal")))
  );
}

/**
 * 로그아웃 등에서: 현재 브라우저 구독 ID를 DB에서 제거(또는 없으면 전부 초기화).
 * body: { subscriptionId?: string }
 */
export async function DELETE(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { subscriptionId?: string };
    const subscriptionId =
      typeof body.subscriptionId === "string" ? body.subscriptionId.trim() : "";

    // 구독 ID가 유효하면 해당 기기만 제거, 아니면 전체 초기화(안전한 로그아웃)
    const removeOne =
      subscriptionId && isLikelyOneSignalSubscriptionId(subscriptionId) ? subscriptionId : null;

    // DB 스키마 다양성/호환을 위해: 현 row를 읽고, 가능한 컬럼만 갱신
    let existing: { playerIds?: string[] | null; playerId?: string | null; oneSignalPlayerId?: string | null } | null =
      null;
    try {
      existing = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { playerIds: true, playerId: true, oneSignalPlayerId: true },
      });
    } catch (e) {
      if (!isMissingPushColumnsError(e)) throw e;
      existing = null;
    }

    const currentIds = Array.isArray(existing?.playerIds)
      ? existing!.playerIds.filter((x) => typeof x === "string")
      : [];
    const nextIds = removeOne ? currentIds.filter((x) => x !== removeOne) : [];

    try {
      const clearLegacy =
        !removeOne ||
        existing?.playerId === removeOne ||
        existing?.oneSignalPlayerId === removeOne;
      // OneSignal 서버 쪽 구독도 제거 (삭제 실패는 무시)
      try {
        if (removeOne) {
          await deleteOneSignalSubscriptionRemote(removeOne);
        } else {
          const set = new Set<string>();
          for (const x of currentIds) set.add(x);
          if (existing?.playerId) set.add(existing.playerId);
          if (existing?.oneSignalPlayerId) set.add(existing.oneSignalPlayerId);
          const ids = [...set].filter((x) => typeof x === "string" && x.trim().length > 0);
          await Promise.allSettled(ids.map((sid: string) => deleteOneSignalSubscriptionRemote(sid)));
        }
      } catch {
        /* ignore */
      }
      if (removeOne) {
        await deleteOneSignalSubscriptionRows({ subscriptionId: removeOne });
      } else {
        await deleteOneSignalSubscriptionRows({ userId: session.user.id });
      }
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          ...(existing && "playerIds" in existing ? { playerIds: nextIds } : {}),
          ...(clearLegacy ? { playerId: null, oneSignalPlayerId: null } : {}),
        } as any,
        select: { id: true },
      });
    } catch (e) {
      if (!isMissingPushColumnsError(e)) throw e;
      // 컬럼이 없으면 조용히 성공 처리
    }

    return NextResponse.json({ ok: true, removed: removeOne ? 1 : "all" });
  } catch (e) {
    console.error("[OneSignal register API] DELETE 예외", e);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
