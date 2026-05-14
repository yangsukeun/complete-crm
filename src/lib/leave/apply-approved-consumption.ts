import { Prisma } from "@prisma/client";
import { consumeLeaveDays } from "@/lib/leave/consume-leave-days";

export async function applyApprovedLeaveConsumption(
  tx: Prisma.TransactionClient,
  userId: string,
  leaveRequestId: string,
  days: number,
  asOf: Date
): Promise<void> {
  const alloc = await consumeLeaveDays(tx, userId, days, asOf);

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
