import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { toKstYmd } from "@/lib/date-kst";
import { ensureBalanceCarryAccrual } from "@/lib/leave/ensure-carry-accrual";
import { fifoAllocate, type FifoAllocation, type AccrualRow } from "@/lib/leave/fifo";
import { usableAccrualFromYmd } from "@/lib/leave/leave-period";
import { LEGACY_CARRY_ACCRUAL_YMD } from "@/lib/leave/legacy-carry-sync";
import { leaveRequestDays, isSickLeaveType } from "@/lib/leave/leave-request-days";

export type ReapplyLogLine = string;

function isLegacyCarry(type: string, ymd: string): boolean {
  return type === "CARRY_OVER" && ymd === LEGACY_CARRY_ACCRUAL_YMD;
}

async function loadAccrualRows(userId: string): Promise<AccrualRow[]> {
  const rows = await prisma.leaveAccrual.findMany({
    where: { userId },
    orderBy: [{ accruedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      type: true,
      days: true,
      consumedDays: true,
      accruedAt: true,
      expiresAt: true,
      isExpired: true,
      compensationOwed: true,
      accrualDateYmd: true,
    },
  });
  return rows
    .filter((r) => !isLegacyCarry(r.type, r.accrualDateYmd))
    .map((r) => ({
      id: r.id,
      type: r.type,
      days: r.days,
      consumedDays: r.consumedDays,
      accruedAt: r.accruedAt,
      expiresAt: r.expiresAt,
      isExpired: r.isExpired,
      compensationOwed: r.compensationOwed,
      accrualDateYmd: r.accrualDateYmd,
    }));
}

async function applyFifo(
  tx: Prisma.TransactionClient,
  userId: string,
  days: number,
  asOf: Date,
  dryRun: boolean,
  log: ReapplyLogLine[],
  label: string,
  usableFromYmd?: string
): Promise<FifoAllocation[] | null> {
  if (days <= 1e-9) return [];
  const rows = await tx.leaveAccrual.findMany({
    where: { userId, isExpired: false },
    orderBy: [{ accruedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      type: true,
      days: true,
      consumedDays: true,
      accruedAt: true,
      expiresAt: true,
      isExpired: true,
      compensationOwed: true,
      accrualDateYmd: true,
    },
  });
  const accruals = rows
    .filter((r) => !isLegacyCarry(r.type, r.accrualDateYmd))
    .map((r) => ({
      id: r.id,
      type: r.type,
      days: r.days,
      consumedDays: r.consumedDays,
      accruedAt: r.accruedAt,
      expiresAt: r.expiresAt,
      isExpired: r.isExpired,
      compensationOwed: r.compensationOwed,
      accrualDateYmd: r.accrualDateYmd,
    }));

  const alloc = fifoAllocate(accruals, days, asOf, { usableFromYmd });
  if (!alloc) {
    log.push(`⚠ ${label}: FIFO 부족 ${days}일`);
    return null;
  }
  for (const a of alloc) {
    const row = accruals.find((r) => r.id === a.accrualId);
    log.push(`  ${label} → ${a.accrualId.slice(0, 8)}… +${a.days}일`);
    if (!dryRun && row) {
      await tx.leaveAccrual.update({
        where: { id: a.accrualId },
        data: { consumedDays: { increment: a.days } },
      });
      row.consumedDays += a.days;
    }
  }
  return alloc;
}

async function applyStoredAllocations(
  tx: Prisma.TransactionClient,
  allocations: { accrualId: string; days: number }[],
  dryRun: boolean,
  log: ReapplyLogLine[],
  label: string
): Promise<number> {
  let n = 0;
  for (const a of allocations) {
    log.push(`  ${label} (저장분) → ${a.accrualId.slice(0, 8)}… +${a.days}일`);
    if (!dryRun) {
      await tx.leaveAccrual.update({
        where: { id: a.accrualId },
        data: { consumedDays: { increment: a.days } },
      });
    }
    n += a.days;
  }
  return n;
}

/**
 * consumedDays 리셋 후 이전 사용분(manual) + 승인 휴가(FIFO 또는 accrualAllocations) 재적용.
 */
export async function reapplyLeaveConsumptionForUser(
  userId: string,
  opts: { dryRun?: boolean; asOf?: Date } = {}
): Promise<ReapplyLogLine[]> {
  const dryRun = opts.dryRun ?? false;
  const asOf = opts.asOf ?? new Date();
  const asOfYmd = toKstYmd(asOf);
  const log: ReapplyLogLine[] = [];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, joinDate: true },
  });
  log.push(`=== ${user?.name ?? userId} (${user?.email ?? ""}) ===`);

  const joinYmd = user?.joinDate ? toKstYmd(user.joinDate) : "";
  const usableFromYmd = joinYmd ? usableAccrualFromYmd(joinYmd, asOfYmd) : undefined;

  if (!dryRun) {
    await prisma.leaveAccrual.updateMany({
      where: { userId },
      data: { consumedDays: 0 },
    });
    await prisma.leaveRequest.updateMany({
      where: { userId, status: "APPROVED" },
      data: { accrualAllocations: Prisma.JsonNull },
    });
    await prisma.leaveAccrual.deleteMany({
      where: {
        userId,
        type: "CARRY_OVER",
        accrualDateYmd: LEGACY_CARRY_ACCRUAL_YMD,
      },
    });
    await ensureBalanceCarryAccrual(userId);
  } else {
    log.push("[dry-run] consumedDays→0, 레거시 CARRY 삭제 생략");
  }

  const balances = await prisma.leaveBalance.findMany({
    where: { userId },
    select: { manualDeduction: true },
  });
  const priorTotal = balances.reduce((s, b) => s + (b.manualDeduction ?? 0), 0);

  const run = async (tx: Prisma.TransactionClient) => {
    if (priorTotal > 1e-6) {
      log.push(`이전 사용분(CRM 전) ${priorTotal}일 (FIFO 기준일 ${asOfYmd})`);
      await applyFifo(tx, userId, priorTotal, asOf, dryRun, log, "PRIOR", usableFromYmd);
    }

    const requests = await tx.leaveRequest.findMany({
      where: { userId, status: "APPROVED" },
      orderBy: { startDate: "asc" },
    });

    for (const r of requests) {
      if (isSickLeaveType(r.type)) continue;
      const startYmd = toKstYmd(r.startDate);
      if (startYmd > asOfYmd) {
        log.push(`승인 ${startYmd} — 스킵(기준일 ${asOfYmd} 이후)`);
        continue;
      }
      const days = leaveRequestDays(r.type, r.startDate, r.endDate);
      if (days <= 1e-9) continue;

      const raw = r.accrualAllocations;
      if (raw && Array.isArray(raw) && raw.length > 0) {
        log.push(`승인 ${r.startDate.toISOString().slice(0, 10)} ${days}일 (alloc 기록)`);
        await applyStoredAllocations(
          tx,
          raw as { accrualId: string; days: number }[],
          dryRun,
          log,
          `LeaveRequest:${r.id.slice(0, 8)}`
        );
      } else {
        log.push(`승인 ${r.startDate.toISOString().slice(0, 10)} ${days}일 (FIFO)`);
        const alloc = await applyFifo(
          tx,
          userId,
          days,
          r.startDate,
          dryRun,
          log,
          `LeaveRequest:${r.id.slice(0, 8)}`,
          usableFromYmd
        );
        if (!dryRun && alloc && alloc.length > 0) {
          await tx.leaveRequest.update({
            where: { id: r.id },
            data: { accrualAllocations: alloc as unknown as Prisma.InputJsonValue },
          });
        }
      }
    }
  };

  if (dryRun) {
    await run(prisma as unknown as Prisma.TransactionClient);
    const preview = await loadAccrualRows(userId);
    const sum = preview.reduce((s, a) => s + a.consumedDays, 0);
    log.push(`[dry-run] 예상 consumedDays 합(현재 DB 기준 시뮬 미반영): prior+승인 재계산 필요 — apply 후 확인`);
    log.push(`[dry-run] 현재 consumed 합: ${sum}`);
  } else {
    await prisma.$transaction(run);
    const after = await prisma.leaveAccrual.findMany({
      where: { userId },
      orderBy: { accrualDateYmd: "asc" },
    });
    const pool = after.filter((a) => !isLegacyCarry(a.type, a.accrualDateYmd));
    const entitled = pool.reduce((s, a) => s + a.days, 0);
    const consumed = pool.reduce((s, a) => s + a.consumedDays, 0);
    const avail = pool.filter((a) => !a.isExpired).reduce((s, a) => s + Math.max(0, a.days - a.consumedDays), 0);
    log.push(`재적용 후: 발생=${entitled} 사용=${consumed} 잔여=${avail}`);
  }

  return log;
}
