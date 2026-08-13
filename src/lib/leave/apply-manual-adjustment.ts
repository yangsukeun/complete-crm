import type { Prisma } from "@prisma/client";
import { consumeLeaveDays } from "@/lib/leave/consume-leave-days";
import { toKstYmd } from "@/lib/date-kst";
import { expiresAtFromAccrualYmd, startOfKstDayFromYmd } from "@/lib/leave/kst-date";

const MAX_ABS_DAYS = 365;

export async function applyManualLeaveAdjustment(
  tx: Prisma.TransactionClient,
  opts: {
    userId: string;
    actorId: string;
    days: number;
    reason: string;
    asOf?: Date;
  }
): Promise<{ id: string }> {
  const reason = opts.reason.trim();
  if (!reason) {
    throw new Error("LEAVE_ADJUST_REASON_REQUIRED");
  }
  const days = opts.days;
  if (!Number.isFinite(days) || days === 0) {
    throw new Error("LEAVE_ADJUST_DAYS_INVALID");
  }
  if (Math.abs(days) > MAX_ABS_DAYS) {
    throw new Error("LEAVE_ADJUST_DAYS_RANGE");
  }

  const asOf = opts.asOf ?? new Date();
  const ymd = toKstYmd(asOf);

  if (days > 0) {
    const existing = await tx.leaveAccrual.findUnique({
      where: {
        userId_type_accrualDateYmd: {
          userId: opts.userId,
          type: "MANUAL_ADJUSTMENT",
          accrualDateYmd: ymd,
        },
      },
      select: { id: true },
    });
    if (existing) {
      await tx.leaveAccrual.update({
        where: { id: existing.id },
        data: { days: { increment: days } },
      });
    } else {
      await tx.leaveAccrual.create({
        data: {
          userId: opts.userId,
          type: "MANUAL_ADJUSTMENT",
          days,
          accrualDateYmd: ymd,
          accruedAt: startOfKstDayFromYmd(ymd),
          expiresAt: expiresAtFromAccrualYmd(ymd),
          note: "관리자 조정",
        },
      });
    }
  } else {
    await consumeLeaveDays(tx, opts.userId, Math.abs(days), asOf);
  }

  const row = await tx.leaveAdjustment.create({
    data: {
      userId: opts.userId,
      actorId: opts.actorId,
      days,
      reason,
    },
    select: { id: true },
  });
  return row;
}
