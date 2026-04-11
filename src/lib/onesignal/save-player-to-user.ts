import "server-only";

import prisma from "@/lib/prisma";

/** OneSignal subscription id 최소 길이 (너무 짧은 값은 저장하지 않음) */
const SUB_MIN_LEN = 8;
const MAX_DEVICE_IDS = 30;

function normalizeId(s: string | null | undefined): string | null {
  const t = s?.trim();
  if (!t || t.length < SUB_MIN_LEN) return null;
  return t;
}

function mergeSubscriptionIds(
  currentIds: string[] | null | undefined,
  legacyPlayer: string | null | undefined,
  legacyOneSignal: string | null | undefined,
  incoming: string
): string[] {
  const set = new Set<string>();
  const add = (s: string | null | undefined) => {
    const n = normalizeId(s ?? null);
    if (n) set.add(n);
  };
  for (const x of currentIds ?? []) add(x);
  add(legacyPlayer);
  add(legacyOneSignal);
  add(incoming);
  const merged = [...set];
  if (merged.length <= MAX_DEVICE_IDS) return merged;
  return merged.slice(merged.length - MAX_DEVICE_IDS);
}

type UserPushRow = {
  playerIds: string[];
  playerId: string | null;
  oneSignalPlayerId: string | null;
};

async function loadUserPushRow(userId: string): Promise<UserPushRow> {
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { playerIds: true, playerId: true, oneSignalPlayerId: true },
    });
    return {
      playerIds: Array.isArray(u?.playerIds) ? u!.playerIds.filter((x) => typeof x === "string") : [],
      playerId: u?.playerId ?? null,
      oneSignalPlayerId: u?.oneSignalPlayerId ?? null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/playerIds|Unknown column|does not exist|Unknown field/i.test(msg)) {
      try {
        const u = await prisma.user.findUnique({
          where: { id: userId },
          select: { playerId: true, oneSignalPlayerId: true },
        });
        return {
          playerIds: [],
          playerId: u?.playerId ?? null,
          oneSignalPlayerId: u?.oneSignalPlayerId ?? null,
        };
      } catch {
        return { playerIds: [], playerId: null, oneSignalPlayerId: null };
      }
    }
    return { playerIds: [], playerId: null, oneSignalPlayerId: null };
  }
}

/**
 * OneSignal 구독 ID를 User에 누적 저장 (다기기).
 * PostgreSQL 에서는 동시에 다른 기기가 등록해도 덮어쓰지 않도록 raw 로 playerIds 에 idempotent append.
 * 레거시 oneSignalPlayerId / playerId 는 마지막 등록 구독으로 유지.
 */
export async function saveOneSignalIdsToUser(userId: string, store: string | null): Promise<void> {
  const value = normalizeId(store);
  if (value === null) return;

  const logFail = (step: string, err: unknown) =>
    console.warn(`[OneSignal savePlayer] ${step}`, err instanceof Error ? err.message : String(err));

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET
        "playerIds" = CASE
          WHEN $1::text = ANY(COALESCE("playerIds", ARRAY[]::text[])) THEN COALESCE("playerIds", ARRAY[]::text[])
          ELSE array_append(COALESCE("playerIds", ARRAY[]::text[]), $1::text)
        END,
        "playerId" = $1,
        "oneSignalPlayerId" = $1
      WHERE "id" = $2`,
      value,
      userId
    );
    return;
  } catch (eRaw) {
    const msg = eRaw instanceof Error ? eRaw.message : String(eRaw);
    if (!/playerIds|column|does not exist|syntax error/i.test(msg)) {
      logFail("raw playerIds append 실패 → Prisma 병합 시도", eRaw);
    }
  }

  const row = await loadUserPushRow(userId);
  const merged = mergeSubscriptionIds(row.playerIds, row.playerId, row.oneSignalPlayerId, value);

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        playerIds: merged,
        oneSignalPlayerId: value,
        playerId: value,
      },
    });
    return;
  } catch (e1) {
    logFail("playerIds+legacy → try legacy only", e1);
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { oneSignalPlayerId: value, playerId: value },
    });
    return;
  } catch (e2) {
    logFail("both legacy fields → try oneSignalPlayerId only", e2);
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { oneSignalPlayerId: value },
    });
    return;
  } catch (e3) {
    logFail("oneSignalPlayerId Prisma → try raw SQL", e3);
  }

  try {
    await prisma.$executeRawUnsafe(`UPDATE "User" SET "oneSignalPlayerId" = $1 WHERE "id" = $2`, value, userId);
    return;
  } catch (e4) {
    try {
      await prisma.$executeRawUnsafe(`UPDATE "User" SET "playerId" = $1 WHERE "id" = $2`, value, userId);
      return;
    } catch (e5) {
      console.error("[OneSignal savePlayer] 모든 저장 경로 실패", e5);
      throw e5;
    }
  }
}
