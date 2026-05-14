import type { LeaveAccrual } from "@prisma/client";
import { isExpiredByAsOf } from "@/lib/leave/kst-date";

export type AccrualRow = Pick<
  LeaveAccrual,
  "id" | "type" | "days" | "consumedDays" | "accruedAt" | "expiresAt" | "isExpired" | "compensationOwed"
>;

export type FifoAllocation = { accrualId: string; days: number };

/**
 * 발생일 빠른 순 FIFO로 amount 일만큼 배분(가용 잔여가 부족하면 null).
 */
export function fifoAllocate(accruals: AccrualRow[], amount: number, asOf: Date): FifoAllocation[] | null {
  if (amount <= 0) return [];
  const sorted = accruals
    .filter((r) => !r.isExpired && !isExpiredByAsOf(r.expiresAt, asOf))
    .slice()
    .sort((a, b) => {
      const t = a.accruedAt.getTime() - b.accruedAt.getTime();
      if (t !== 0) return t;
      return a.id.localeCompare(b.id);
    });

  const out: FifoAllocation[] = [];
  let left = amount;
  for (const r of sorted) {
    if (left <= 0.00001) break;
    const rem = Math.max(0, r.days - r.consumedDays);
    if (rem <= 0.00001) continue;
    const take = Math.min(rem, left);
    out.push({ accrualId: r.id, days: take });
    left -= take;
  }
  if (left > 0.00001) return null;
  return out;
}