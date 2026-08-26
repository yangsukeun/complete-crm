import type { Prisma } from "@prisma/client";
import { toKstYmd } from "@/lib/date-kst";
import { fifoAllocate, type AccrualRow, type FifoAllocation } from "@/lib/leave/fifo";
import { usableAccrualFromYmd } from "@/lib/leave/leave-period";

/**
 * 사용 일수를 발생일이 빠른 순(FIFO)으로 차감. 동일 accruedAt은 id 오름차순으로 안정 정렬.
 * 입사기념일 기준 직전 기간보다 오래된 발생분은 사용하지 않는다.
 * @returns accrualAllocations JSON에 저장할 배분
 */
export async function consumeLeaveDays(
  tx: Prisma.TransactionClient,
  userId: string,
  daysToConsume: number,
  asOf: Date
): Promise<FifoAllocation[]> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { joinDate: true },
  });
  const joinYmd = user?.joinDate ? toKstYmd(user.joinDate) : "";
  const usableFromYmd = joinYmd ? usableAccrualFromYmd(joinYmd, toKstYmd(asOf)) : undefined;

  const accruals = await tx.leaveAccrual.findMany({
    where: {
      userId,
      isExpired: false,
    },
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

  const alloc = fifoAllocate(accruals as AccrualRow[], daysToConsume, asOf, {
    usableFromYmd,
  });
  if (!alloc) {
    throw new Error("LEAVE_POOL_INSUFFICIENT");
  }

  for (const a of alloc) {
    await tx.leaveAccrual.update({
      where: { id: a.accrualId },
      data: { consumedDays: { increment: a.days } },
    });
  }

  return alloc;
}
