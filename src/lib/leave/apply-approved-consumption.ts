import { Prisma } from "@prisma/client";
import { fifoAllocate, type AccrualRow } from "@/lib/leave/fifo";

export async function applyApprovedLeaveConsumption(
  tx: Prisma.TransactionClient,
  userId: string,
  leaveRequestId: string,
  days: number,
  asOf: Date
): Promise<void> {
  const rows = await tx.leaveAccrual.findMany({
    where: { userId },
    orderBy: { accruedAt: "asc" },
    select: {
      id: true,
      type: true,
      days: true,
      consumedDays: true,
      accruedAt: true,
      expiresAt: true,
      isExpired: true,
      compensationOwed: true,
    },
  });

  const alloc = fifoAllocate(rows as AccrualRow[], days, asOf);
  if (!alloc) {
    throw new Error("LEAVE_POOL_INSUFFICIENT");
  }

  for (const a of alloc) {
    await tx.leaveAccrual.update({
      where: { id: a.accrualId },
      data: { consumedDays: { increment: a.days } },
    });
  }

  await tx.leaveRequest.update({
    where: { id: leaveRequestId },
    data: { accrualAllocations: alloc as unknown as Prisma.InputJsonValue },
  });
}

export async function reverseApprovedLeaveConsumption(
  tx: Prisma.TransactionClient,
  leaveRequestId: string
): Promise<void> {
  const leave = await tx.leaveRequest.findUnique({
    where: { id: leaveRequestId },
    select: { accrualAllocations: true },
  });
  const raw = leave?.accrualAllocations;
  if (!raw || !Array.isArray(raw)) return;

  for (const item of raw as { accrualId: string; days: number }[]) {
    await tx.leaveAccrual.update({
      where: { id: item.accrualId },
      data: { consumedDays: { decrement: item.days } },
    });
  }

  await tx.leaveRequest.update({
    where: { id: leaveRequestId },
    data: { accrualAllocations: Prisma.JsonNull },
  });
}
