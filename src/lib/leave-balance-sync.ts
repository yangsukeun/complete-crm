import prisma from "@/lib/prisma";

/** 계산된 부여일·사용일이 DB LeaveBalance 와 어긋나면 맞춤. */
export async function syncLeaveBalanceAnnualTotalIfStale(
  userId: string,
  year: number,
  entitlement: number,
  balance: { annualTotal: number } | null,
  opts?: { annualUsed?: number }
): Promise<void> {
  if (!balance) return;
  const data: { annualTotal?: number; annualUsed?: number } = {};
  if (Math.abs((balance.annualTotal ?? 0) - entitlement) >= 0.001) {
    data.annualTotal = entitlement;
  }
  if (opts?.annualUsed != null && Number.isFinite(opts.annualUsed)) {
    data.annualUsed = opts.annualUsed;
  }
  if (Object.keys(data).length === 0) return;
  try {
    await prisma.leaveBalance.update({
      where: { userId_year: { userId, year } },
      data,
    });
  } catch (e) {
    console.warn("[leave-balance-sync] 갱신 실패:", e);
  }
}
