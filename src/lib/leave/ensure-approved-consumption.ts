import prisma from "@/lib/prisma";
import { toKstYmd } from "@/lib/date-kst";
import { applyApprovedLeaveConsumption } from "@/lib/leave/apply-approved-consumption";
import { isSickLeaveType, leaveRequestDays } from "@/lib/leave/leave-request-days";

export type EnsureConsumptionResult = {
  applied: number;
  /** 풀 부족으로 차감하지 못하고 건너뛴 승인 휴가 ID (조회 시 throw 대신 기록) */
  shortageRequestIds: string[];
};

/**
 * 시작일이 asOf 이하인데 아직 accrualAllocations 없는 승인 휴가 → FIFO 차감.
 * (미래 일자 승인은 시작일까지 consumedDays 미반영)
 *
 * 조회/정합화 경로에서 호출되므로, 풀 부족(LEAVE_POOL_INSUFFICIENT) 시 throw하지 않고
 * 해당 건만 건너뛴 뒤 shortageRequestIds에 기록한다(목록 전체가 깨지지 않도록).
 * 실제 차감 commit의 strict throw는 consumeLeaveDays·승인 라우트에 그대로 둔다.
 */
export async function ensureApprovedLeavesConsumedUpTo(
  userId: string,
  asOf: Date = new Date(),
  userName?: string | null
): Promise<EnsureConsumptionResult> {
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
  const shortageRequestIds: string[] = [];
  for (const r of requests) {
    if (isSickLeaveType(r.type)) continue;
    if (toKstYmd(r.startDate) > asOfYmd) continue;
    if (r.accrualAllocations != null) continue;

    const days = leaveRequestDays(r.type, r.startDate, r.endDate);
    if (days <= 1e-9) continue;

    try {
      await prisma.$transaction(async (tx) => {
        await applyApprovedLeaveConsumption(tx, userId, r.id, days, r.startDate);
      });
      applied++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("LEAVE_POOL_INSUFFICIENT")) {
        console.warn(
          `[ensureApprovedLeavesConsumedUpTo] insufficient pool, skip userId=${userId} name=${userName ?? "?"} requestId=${r.id} type=${r.type} days=${days} start=${toKstYmd(r.startDate)}`
        );
        shortageRequestIds.push(r.id);
        continue;
      }
      throw err;
    }
  }
  return { applied, shortageRequestIds };
}
