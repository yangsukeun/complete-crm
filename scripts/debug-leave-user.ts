/**
 * 직원 연차 진단. npx tsx scripts/debug-leave-user.ts --email=user@example.com
 */
import "dotenv/config";
import prisma from "../src/lib/prisma";
import { calculateLeavePool } from "../src/lib/leave/calculate-pool";
import { leaveRequestDays } from "../src/lib/leave/leave-request-days";

function parseArgs() {
  const emailFlag = process.argv.find((a) => a.startsWith("--email="));
  const email = emailFlag?.split("=")[1]?.trim();
  if (!email) {
    console.error("사용: npx tsx scripts/debug-leave-user.ts --email=...");
    process.exit(1);
  }
  return email;
}

async function main() {
  const email = parseArgs();
  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true, name: true, email: true, joinDate: true },
  });
  if (!user) {
    console.log("user not found");
    return;
  }

  const balances = await prisma.leaveBalance.findMany({
    where: { userId: user.id },
    orderBy: { year: "asc" },
    select: { year: true, manualDeduction: true, annualUsed: true, annualCarryOver: true, annualTotal: true },
  });

  const accruals = await prisma.leaveAccrual.findMany({
    where: { userId: user.id },
    orderBy: { accrualDateYmd: "asc" },
  });

  console.log(`=== ${user.name} (${user.email}) join=${user.joinDate?.toISOString().slice(0, 10)} ===\n`);
  console.log("=== LeaveBalance (연도별) ===");
  let manualSum = 0;
  for (const b of balances) {
    manualSum += b.manualDeduction ?? 0;
    console.log(
      `year=${b.year} manualDeduction=${b.manualDeduction} annualUsed=${b.annualUsed} carry=${b.annualCarryOver} annualTotal=${b.annualTotal}`
    );
  }
  console.log(`manualDeduction 합: ${manualSum}`);

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
    const d = leaveRequestDays(r.type, r.startDate, r.endDate);
    const span =
      Math.ceil((r.endDate.getTime() - r.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    approvedSum += d;
    const alloc = r.accrualAllocations;
    const sameDay = r.startDate.toISOString().slice(0, 10) === r.endDate.toISOString().slice(0, 10);
    const flag = sameDay && d < span - 0.01 ? ` (span=${span}일, 계산=${d}일)` : "";
    console.log(
      `${r.startDate.toISOString().slice(0, 10)} ~ ${r.endDate.toISOString().slice(0, 10)} | calc=${d}일 | ${r.type}${flag} | alloc=${alloc ? JSON.stringify(alloc) : "—"}`
    );
  }

  const totalAccrued = poolRows.reduce((s, a) => s + a.days, 0);
  const totalConsumed = poolRows.reduce((s, a) => s + a.consumedDays, 0);
  const totalExpired = poolRows
    .filter((a) => a.isExpired)
    .reduce((s, a) => s + Math.max(0, a.days - a.consumedDays), 0);
  const totalAvail = poolRows
    .filter((a) => !a.isExpired)
    .reduce((s, a) => s + Math.max(0, a.days - a.consumedDays), 0);

  console.log("\n=== Summary (pool rows, no legacy CARRY) ===");
  console.log(`총 발생: ${totalAccrued}`);
  console.log(`consumedDays 합: ${totalConsumed}`);
  console.log(`소멸(미소진): ${totalExpired}`);
  console.log(`미만료 잔여(행 합): ${totalAvail}`);
  console.log(`승인 휴가 일수 합(leaveRequestDays): ${approvedSum}`);
  console.log(`산수 검증: ${totalAccrued} ≈ ${totalConsumed + totalExpired + totalAvail} → ${Math.abs(totalAccrued - (totalConsumed + totalExpired + totalAvail)) < 0.02}`);

  const pool = await calculateLeavePool(user.id, new Date(), { skipAccrue: true });
  const bd = pool.breakdown;
  console.log("\n=== calculateLeavePool (현재 시각) ===");
  console.log(`월차 ${bd.monthlyUnderOneYear.available}/${bd.monthlyUnderOneYear.entitled} used=${bd.monthlyUnderOneYear.consumed}`);
  console.log(`정규 ${bd.annualAfterOneYear.available}/${bd.annualAfterOneYear.entitled} used=${bd.annualAfterOneYear.consumed}`);
  console.log(`근속가산 ${bd.tenureBonus.available}/${bd.tenureBonus.entitled}`);
  console.log(`표시 잔여(available): ${pool.available}`);
  console.log(`표시 사용계: ${pool.totalConsumedDaysFromAccruals}`);
  console.log(`이전 사용분(표시): ${pool.priorCrmUsageDays}`);
  console.log(`poolMathConsistent: ${pool.poolMathConsistent}`);
}

main().finally(() => prisma.$disconnect());
