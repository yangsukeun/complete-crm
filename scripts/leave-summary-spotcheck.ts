/**
 * 직원 연차 요약 스팟체크 (API 없이 calculateLeavePool). npx tsx scripts/leave-summary-spotcheck.ts
 */
import "dotenv/config";
import prisma from "../src/lib/prisma";
import { calculateLeavePool } from "../src/lib/leave/calculate-pool";

const TARGETS = [
  "fourze92618@gmail.com",
  "complete.st20@gmail.com",
  "wooha410@naver.com",
  "bscomplete2020@naver.com",
  "iihayeon052@gmail.com",
];

function fmt(b: { available: number; entitled: number }) {
  return `${b.available.toFixed(1)}/${b.entitled.toFixed(1)}`;
}

async function main() {
  const asOf = new Date();
  console.log(`asOf=${asOf.toISOString()}\n`);

  for (const email of TARGETS) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
    if (!u) {
      console.log(`${email}: not found`);
      continue;
    }
    const pool = await calculateLeavePool(u.id, asOf);
    const b = pool.breakdown;
    console.log(`${u.name} (${email})`);
    console.log(`  1년차월차 ${fmt(b.monthlyUnderOneYear)}`);
    console.log(`  정규연차 ${fmt(b.annualAfterOneYear)}`);
    console.log(`  근속가산 ${fmt(b.tenureBonus)}`);
    console.log(`  priorCRM ${pool.priorCrmUsageDays} · carry표기 ${pool.annualCarryOverDaysReported} · 산수OK ${pool.poolMathConsistent}`);
    console.log(`  사용계 ${pool.totalConsumedDaysFromAccruals.toFixed(1)}`);
    console.log(`  소멸계 ${pool.totalExpired.toFixed(1)}`);
    console.log(`  잔여 ${pool.available.toFixed(1)}일`);
    console.log("");
  }
}

main().finally(() => prisma.$disconnect());
