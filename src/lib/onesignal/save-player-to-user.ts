import "server-only";

import prisma from "@/lib/prisma";

function isMissingPlayerIdColumn(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (!/playerId/i.test(msg)) return false;
  return (
    /Unknown (field|column|argument|arg)/i.test(msg) ||
    /column .* does not exist/i.test(msg) ||
    /The column .* does not exist/i.test(msg) ||
    /invalid .*prisma\.user\.update/i.test(msg)
  );
}

/**
 * oneSignalPlayerId + playerId 동시 저장. DB에 playerId 컬럼이 없으면 oneSignalPlayerId만 저장 (마이그레이션 미적용 배포 대비).
 */
export async function saveOneSignalIdsToUser(userId: string, store: string | null): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { oneSignalPlayerId: store, playerId: store },
    });
  } catch (e) {
    if (isMissingPlayerIdColumn(e)) {
      console.warn("[OneSignal savePlayer] playerId 컬럼 없음 → oneSignalPlayerId만 저장", { userId });
      await prisma.user.update({
        where: { id: userId },
        data: { oneSignalPlayerId: store },
      });
      return;
    }
    throw e;
  }
}
