import { NextResponse } from "next/server";
import { subDays } from "date-fns";
import prisma from "@/lib/prisma";
import { verifyCronRequest } from "@/lib/cron-auth";
import { deleteOneSignalSubscriptionRemote } from "@/lib/onesignal/delete-subscription-remote";

export const runtime = "nodejs";

const DEFAULT_STALE_DAYS = 90;

/**
 * OneSignalSubscription.lastSeenAt 기준 좀비 구독 정리.
 * - REST로 OneSignal 구독 삭제 시도
 * - DB 행 삭제
 * - User.playerIds / 레거시 playerId 컬럼에서 해당 id 제거
 */
export async function GET(req: Request) {
  const denied = verifyCronRequest(req);
  if (denied) return denied;

  const raw = process.env.ONESIGNAL_SUBSCRIPTION_STALE_DAYS;
  const staleDays = Math.min(365, Math.max(30, parseInt(raw || String(DEFAULT_STALE_DAYS), 10) || DEFAULT_STALE_DAYS));
  const cutoff = subDays(new Date(), staleDays);

  const stale = await prisma.oneSignalSubscription.findMany({
    where: { lastSeenAt: { lt: cutoff } },
    select: { id: true, subscriptionId: true, userId: true },
    take: 200,
  });

  let remoteOk = 0;
  let dbRemoved = 0;
  let usersStripped = 0;

  for (const row of stale) {
    const ok = await deleteOneSignalSubscriptionRemote(row.subscriptionId);
    if (ok) remoteOk += 1;

    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "User" SET
          "playerIds" = array_remove(COALESCE("playerIds", ARRAY[]::text[]), $1::text),
          "playerId" = CASE WHEN "playerId" = $1::text THEN NULL ELSE "playerId" END,
          "oneSignalPlayerId" = CASE WHEN "oneSignalPlayerId" = $1::text THEN NULL ELSE "oneSignalPlayerId" END
        WHERE $1::text = ANY(COALESCE("playerIds", ARRAY[]::text[]))
           OR "playerId" = $1::text OR "oneSignalPlayerId" = $1::text`,
        row.subscriptionId
      );
      usersStripped += 1;
    } catch (e) {
      console.warn("[cron onesignal cleanup] User playerIds 정리 실패", row.subscriptionId, e);
    }

    try {
      await prisma.oneSignalSubscription.delete({ where: { id: row.id } });
      dbRemoved += 1;
    } catch (e) {
      console.warn("[cron onesignal cleanup] DB 삭제 실패", row.id, e);
    }
  }

  return NextResponse.json({
    ok: true,
    staleDays,
    cutoff: cutoff.toISOString(),
    scanned: stale.length,
    oneSignalDeleteAccepted: remoteOk,
    subscriptionsRemoved: dbRemoved,
    userRowsTouched: usersStripped,
  });
}
