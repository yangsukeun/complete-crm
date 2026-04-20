import "server-only";

import prisma from "@/lib/prisma";
import { isLikelyOneSignalSubscriptionId } from "@/lib/onesignal/subscription-id";

/** 구독 등록·갱신 시 lastSeenAt 갱신 (크론 좀비 판정 기준) */
export async function touchOneSignalSubscriptionLastSeen(
  userId: string,
  subscriptionId: string
): Promise<void> {
  const sid = subscriptionId.trim();
  if (!sid || !isLikelyOneSignalSubscriptionId(sid)) return;
  const now = new Date();
  try {
    await prisma.oneSignalSubscription.upsert({
      where: { subscriptionId: sid },
      create: { userId, subscriptionId: sid, lastSeenAt: now },
      update: { userId, lastSeenAt: now },
    });
  } catch (e) {
    console.warn("[OneSignalSubscription] lastSeen upsert 실패", e instanceof Error ? e.message : e);
  }
}

export async function deleteOneSignalSubscriptionRows(
  where: { userId: string } | { subscriptionId: string }
): Promise<number> {
  try {
    const r = await prisma.oneSignalSubscription.deleteMany({ where });
    return r.count;
  } catch (e) {
    console.warn("[OneSignalSubscription] deleteMany 실패", e instanceof Error ? e.message : e);
    return 0;
  }
}
