import type { LeaveAccrual } from "@prisma/client";
import { isExpiredByAsOf } from "@/lib/leave/kst-date";

export type AccrualRow = Pick<
  LeaveAccrual,
  | "id"
  | "type"
  | "days"
  | "consumedDays"
  | "accruedAt"
  | "expiresAt"
  | "isExpired"
  | "compensationOwed"
> & {
  accrualDateYmd?: string;
};

export type FifoAllocation = { accrualId: string; days: number };

export type FifoAllocateOptions = {
  /** 이 일자(포함) 이전 발생분은 사용 불가 — 입사기념일 직전 기간 하한 */
  usableFromYmd?: string;
};

/**
 * 발생일 빠른 순 FIFO로 amount 일만큼 배분(가용 잔여가 부족하면 null).
 */
export function fifoAllocate(
  accruals: AccrualRow[],
  amount: number,
  asOf: Date,
  options?: FifoAllocateOptions
): FifoAllocation[] | null {
  if (amount <= 0) return [];
  const usableFrom = options?.usableFromYmd?.trim() || "";
  const sorted = accruals
    .filter((r) => {
      if (r.isExpired || isExpiredByAsOf(r.expiresAt, asOf)) return false;
      if (usableFrom && r.accrualDateYmd && r.accrualDateYmd < usableFrom) return false;
      return true;
    })
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
