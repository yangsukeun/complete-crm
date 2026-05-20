/**
 * 손예지 LeaveAccrual·승인 휴가 진단. npx tsx scripts/debug-son-yeji.ts
 */
import "dotenv/config";
import prisma from "../src/lib/prisma";
import { calculateLeavePool } from "../src/lib/leave/calculate-pool";

const leaveTypeDays: Record<string, number> = {
  ANNUAL: 1,
  HALF_AM: 0.5,
  HALF_PM: 0.5,
  QUARTER_AM: 0.25,
  QUARTER_PM: 0.25,
};

function requestDays(type: string, start: Date, end: Date): number {
  if (type === "SICK_PAID" || type === "SICK_UNPAID") return 0;
  if (type === "ANNUAL") {
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }
  return leaveTypeDays[type] ?? 0;
}

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "complete.st20@gmail.com" },
    select: { id: true, name: true, email: true, joinDate: true },
  });
  if (!user) {
    console.log("user not found");
    return;
  }

  const balances = await prisma.leaveBalance.findMany({
    where: { userId: user.id },
    select: { year: true, manualDeduction: true, annualUsed: true, annualCarryOver: true },
  });

  const accruals = await prisma.leaveAccrual.findMany({
    where: { userId: user.id },
    orderBy: { accrualDateYmd: "asc" },
  });

  console.log(`=== ${user.name} (${user.email}) join=${user.joinDate?.toISOString().slice(0, 10)} ===\n`);
  console.log("=== LeaveBalance ===");
  for (const b of balances) {
    console.log(
      `year=${b.year} manualDeduction=${b.manualDeduction} annualUsed=${b.annualUsed} carry=${b.annualCarryOver}`
    );
  }

  console.log("\n=== LeaveAccrual ===");
  for (const a of accruals) {
    console.log(
      `${a.accrualDateYmd} | ${a.type.padEnd(25)} | days=${a.days} | consumed=${a.consumedDays} | expired=${a.isExpired}`
    );
  }

  const poolRows = accruals.filter((a) => !(a.type === "CARRY_OVER" && a.accrualDateYmd === "1900-01-01"));

  console.log("\n=== LeaveRequest (APPROVED) ===");
  const requests = await prisma.leaveRequest.findMany({
    where: { userId: user.id, status: "APPROVED" },
    orderBy: { startDate: "asc" },
  });
  let approvedSum = 0;
  for (const r of requests) {
    const d = requestDays(r.type, r.startDate, r.endDate);
    approvedSum += d;
    const alloc = r.accrualAllocations;
    console.log(
      `${r.startDate.toISOString().slice(0, 10)} ~ ${r.endDate.toISOString().slice(0, 10)} | ${d}일 | ${r.type} | alloc=${alloc ? JSON.stringify(alloc) : "—"}`
    );
  }

  const totalAccrued = poolRows.reduce((s, a) => s + a.days, 0);
  const totalConsumed = poolRows.reduce((s, a) => s + a.consumedDays, 0);
  const totalAvail = poolRows
    .filter((a) => !a.isExpired)
    .reduce((s, a) => s + Math.max(0, a.days - a.consumedDays), 0);

  console.log("\n=== Summary (pool rows, no legacy CARRY) ===");
  console.log(`총 발생: ${totalAccrued}`);
  console.log(`consumedDays 합: ${totalConsumed}`);
  console.log(`미만료 잔여(행 합): ${totalAvail}`);
  console.log(`승인 휴가 일수 합(추정): ${approvedSum}`);
  console.log(`manualDeduction 합: ${balances.reduce((s, b) => s + (b.manualDeduction ?? 0), 0)}`);

  const pool = await calculateLeavePool(user.id, new Date(), { skipAccrue: true });
  const b = pool.breakdown;
  console.log("\n=== calculateLeavePool ===");
  console.log(`월차 ${b.monthlyUnderOneYear.available}/${b.monthlyUnderOneYear.entitled} used=${b.monthlyUnderOneYear.consumed}`);
  console.log(`정규 ${b.annualAfterOneYear.available}/${b.annualAfterOneYear.entitled} used=${b.annualAfterOneYear.consumed}`);
  console.log(`표시 잔여(available): ${pool.available}`);
  console.log(`totalConsumedDaysFromAccruals: ${pool.totalConsumedDaysFromAccruals}`);
  console.log(`priorCrmUsageDays(표시): ${pool.priorCrmUsageDays}`);
  console.log(`poolMathConsistent: ${pool.poolMathConsistent}`);
}

main().finally(() => prisma.$disconnect());
