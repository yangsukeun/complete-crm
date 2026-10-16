import "server-only";

import prisma from "@/lib/prisma";

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY =
  process.env.ONESIGNAL_REST_API_KEY?.trim() ||
  process.env.ONE_SIGNAL_REST_API_KEY?.trim() ||
  "";

export async function cancelOneSignalPush(oneSignalId: string): Promise<void> {
  const appId = ONESIGNAL_APP_ID?.trim();
  const key = ONESIGNAL_REST_API_KEY;
  const id = oneSignalId?.trim();
  if (!appId || !key || !id) return;
  try {
    const res = await fetch(
      `https://api.onesignal.com/notifications/${encodeURIComponent(id)}?app_id=${encodeURIComponent(appId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Key ${key}` },
      }
    );
    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => "");
      console.warn("[onesignal] cancel failed:", res.status, text.slice(0, 400));
    }
  } catch (err) {
    console.error("[onesignal] cancel error:", err);
  }
}

async function postSilentBadgeSyncToOneSignal(body: Record<string, unknown>): Promise<void> {
  const appId = ONESIGNAL_APP_ID?.trim();
  const key = ONESIGNAL_REST_API_KEY;
  if (!appId || !key) return;
  try {
    await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        Authorization: `Key ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ app_id: appId, ...body }),
    });
  } catch (err) {
    console.error("[onesignal] badge sync error:", err);
  }
}

/**
 * 뱃지 카운트 동기화 푸시를 보낼지.
 * 웹 푸시(크롬·PWA)는 조용한(silent) 푸시를 지원하지 않아, 이 푸시가 내용이 빈 알림으로 표시되고
 * 크롬을 켤 때 밀린 빈 알림이 한꺼번에 떴다. 지금 구독은 모두 웹이므로 기본은 끈다.
 * 네이티브 앱을 붙이면 ONESIGNAL_BADGE_SYNC_PUSH=1 로 켠다(그때도 웹 구독에는 보내지 않음).
 */
const BADGE_SYNC_PUSH_ENABLED = process.env.ONESIGNAL_BADGE_SYNC_PUSH === "1";

/**
 * 전 디바이스 뱃지 카운트 동기화 (silent push) — 네이티브 앱 전용
 * - external_id 경로 + subscription_ids 경로를 병행(기기 누락 방지)
 */
export async function syncBadgeCount(userId: string, count: number): Promise<void> {
  const uid = userId?.trim();
  if (!uid || !BADGE_SYNC_PUSH_ENABLED) return;
  const safeCount = Math.max(0, Math.min(9999, Number.isFinite(count) ? count : 0));

  // userIds 기반 external_id는 이미 Transfer/login로 정렬되어 있다고 가정
  const aliasBody: Record<string, unknown> = {
    include_aliases: { external_id: [uid] },
    target_channel: "push",
    content_available: true,
    ios_badgeType: "SetTo",
    ios_badgeCount: safeCount,
    // 콘텐츠가 비어있으면 일부 플랫폼에서 거부될 수 있어 최소 문자열을 넣음
    headings: { en: " ", ko: " " },
    contents: { en: " ", ko: " " },
    data: { type: "badge_sync", count: safeCount },
    // 웹 구독에는 보내지 않는다(빈 알림으로 표시됨). 밀려도 1분 뒤 폐기
    isAnyWeb: false,
    ttl: 60,
  };

  let subscriptionIds: string[] = [];
  try {
    const u = await prisma.user.findUnique({
      where: { id: uid },
      select: { playerIds: true, playerId: true, oneSignalPlayerId: true },
    });
    const set = new Set<string>();
    for (const x of (u?.playerIds ?? []) as unknown[]) {
      if (typeof x === "string" && x.trim()) set.add(x.trim());
    }
    if (u?.playerId?.trim()) set.add(u.playerId.trim());
    if (u?.oneSignalPlayerId?.trim()) set.add(u.oneSignalPlayerId.trim());
    subscriptionIds = [...set];
  } catch {
    subscriptionIds = [];
  }

  const subBody: Record<string, unknown> | null =
    subscriptionIds.length > 0
      ? {
          include_subscription_ids: subscriptionIds,
          target_channel: "push",
          content_available: true,
          ios_badgeType: "SetTo",
          ios_badgeCount: safeCount,
          headings: { en: " ", ko: " " },
          contents: { en: " ", ko: " " },
          data: { type: "badge_sync", count: safeCount },
          isAnyWeb: false,
          ttl: 60,
        }
      : null;

  await Promise.allSettled([
    postSilentBadgeSyncToOneSignal(aliasBody),
    ...(subBody ? [postSilentBadgeSyncToOneSignal(subBody)] : []),
  ]);
}

