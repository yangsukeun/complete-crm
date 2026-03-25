import "server-only";

import prisma from "@/lib/prisma";

/**
 * oneSignalPlayerId (+ playerId) 저장. Prisma/DB 스키마 불일치 시 단계별 폴백으로 500 방지.
 */
export async function saveOneSignalIdsToUser(userId: string, store: string | null): Promise<void> {
  const value = store?.trim() || null;
  if (value === null) return;

  const logFail = (step: string, err: unknown) =>
    console.warn(`[OneSignal savePlayer] ${step}`, err instanceof Error ? err.message : String(err));

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { oneSignalPlayerId: value, playerId: value },
    });
    return;
  } catch (e1) {
    logFail("both fields → try oneSignalPlayerId only", e1);
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { oneSignalPlayerId: value },
    });
    return;
  } catch (e2) {
    logFail("oneSignalPlayerId Prisma → try raw SQL", e2);
  }

  try {
    await prisma.$executeRawUnsafe(`UPDATE "User" SET "oneSignalPlayerId" = $1 WHERE "id" = $2`, value, userId);
    console.log("[OneSignal savePlayer] raw SQL oneSignalPlayerId 저장됨", { userId });
    return;
  } catch (e3) {
    try {
      await prisma.$executeRawUnsafe(`UPDATE "User" SET "playerId" = $1 WHERE "id" = $2`, value, userId);
      console.log("[OneSignal savePlayer] raw SQL playerId만 저장됨", { userId });
      return;
    } catch (e4) {
      console.error("[OneSignal savePlayer] 모든 저장 경로 실패", e4);
      throw e4;
    }
  }
}
