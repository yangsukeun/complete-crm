import prisma from "@/lib/prisma";

/** 계산된 부여일과 DB `LeaveBalance.annualTotal` 이 어긋나면 DB를 맞춤(직원 화면·리포트 일관성). */
export async function syncLeaveBalanceAnnualTotalIfStale(
  userId: string,
  year: number,
  entitlement: number,
  balance: { annualTotal: number } | null
): Promise<void> {
  if (!balance) return;
  if (Math.abs((balance.annualTotal ?? 0) - entitlement) < 0.001) return;
  try {
    await prisma.leaveBalance.update({
      where: { userId_year: { userId, year } },
      data: { annualTotal: entitlement },
    });
  } catch (e) {
    console.warn("[leave-balance-sync] annualTotal 갱신 실패:", e);
  }
}
