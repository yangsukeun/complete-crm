import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { UPLOAD_DAILY_BYTES_PER_USER } from "@/lib/upload-policy";

function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export class DailyUploadQuotaError extends Error {
  constructor() {
    super("일일 업로드 한도(5GB)를 초과했습니다. 내일 다시 시도해 주세요.");
    this.name = "DailyUploadQuotaError";
  }
}

/** 업로드 직전 호출: 초과 시 DailyUploadQuotaError. 성공 시 바이트 선반영(스토어 실패 시 release 호출). */
export async function reserveDailyUploadBytes(userId: string, addBytes: number): Promise<void> {
  const dayKey = utcDayKey();
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(concat(${userId}, ':', ${dayKey})))`;
      const row = await tx.userDailyUploadUsage.findUnique({
        where: { userId_dayKey: { userId, dayKey } },
      });
      const used = row?.bytes != null ? Number(row.bytes) : 0;
      if (used + addBytes > UPLOAD_DAILY_BYTES_PER_USER) {
        throw new DailyUploadQuotaError();
      }
      const add = BigInt(addBytes);
      await tx.userDailyUploadUsage.upsert({
        where: { userId_dayKey: { userId, dayKey } },
        create: { userId, dayKey, bytes: add },
        update: { bytes: { increment: add } },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 }
  );
}

/** 스토어 실패 등으로 선반영분 롤백 */
export async function releaseDailyUploadBytes(userId: string, subBytes: number): Promise<void> {
  if (subBytes <= 0) return;
  const dayKey = utcDayKey();
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(concat(${userId}, ':', ${dayKey})))`;
        const row = await tx.userDailyUploadUsage.findUnique({
          where: { userId_dayKey: { userId, dayKey } },
        });
        if (!row) return;
        const cur = Number(row.bytes);
        const next = Math.max(0, cur - subBytes);
        await tx.userDailyUploadUsage.update({
          where: { userId_dayKey: { userId, dayKey } },
          data: { bytes: BigInt(next) },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 }
    );
  } catch (e) {
    console.error("[upload-daily-quota] release 실패:", e);
  }
}
