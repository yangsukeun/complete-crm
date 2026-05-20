import prisma from "@/lib/prisma";
import { toKstYmd } from "@/lib/date-kst";
import { applyApprovedLeaveConsumption } from "@/lib/leave/apply-approved-consumption";
import { isSickLeaveType, leaveRequestDays } from "@/lib/leave/leave-request-days";

/**
 * 시작일이 asOf 이하인데 아직 accrualAllocations 없는 승인 휴가 → FIFO 차감.
 * (미래 일자 승인은 시작일까지 consumedDays 미반영)
 */
export async function ensureApprovedLeavesConsumedUpTo(userId: string, asOf: Date = new Date()): Promise<number> {
  const asOfYmd = toKstYmd(asOf);
  const requests = await prisma.leaveRequest.findMany({
    where: { userId, status: "APPROVED" },
    orderBy: { startDate: "asc" },
    select: {
      id: true,
      type: true,
      startDate: true,
      endDate: true,
      accrualAllocations: true,
    },
  });

  let applied = 0;
  for (const r of requests) {
    if (isSickLeaveType(r.type)) continue;
    if (toKstYmd(r.startDate) > asOfYmd) continue;
    if (r.accrualAllocations != null) continue;

    const days = leaveRequestDays(r.type, r.startDate, r.endDate);
    if (days <= 1e-9) continue;

    await prisma.$transaction(async (tx) => {
      await applyApprovedLeaveConsumption(tx, userId, r.id, days, r.startDate);
    });
    applied++;
  }
  return applied;
}
