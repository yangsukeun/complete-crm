/**
 * 연차 검증용 SQL (0단계 스냅샷 + 7-A). 실행: npx tsx scripts/leave-sql-verify.ts
 */
import "dotenv/config";
import prisma from "../src/lib/prisma";

async function main() {
  console.log("=== 0단계 / 7-A: 박희준·손예지 LeaveAccrual (스키마 필드: joinDate, accrualDateYmd) ===\n");

  const q0 = `
SELECT u.name, u.email, u."joinDate",
       la.type, la.days, la."consumedDays", la."accruedAt", la."accrualDateYmd", la."isExpired"
FROM "User" u
LEFT JOIN "LeaveAccrual" la ON la."userId" = u.id
WHERE u.email IN ('fourze92618@gmail.com', 'complete.st20@gmail.com')
ORDER BY u.email, la."accruedAt";
`;
  const rows0 = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(q0);
  console.log(JSON.stringify(rows0, null, 2));

  console.log("\n=== 7-A: ANNUAL_AFTER_ONE_YEAR만 ===\n");
  const q7a = `
SELECT u.name, la.type, la.days, la."accruedAt", la."accrualDateYmd"
FROM "User" u
JOIN "LeaveAccrual" la ON la."userId" = u.id
WHERE u.email IN ('fourze92618@gmail.com', 'complete.st20@gmail.com')
  AND la.type = 'ANNUAL_AFTER_ONE_YEAR'
ORDER BY u.email;
`;
  const rows7a = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(q7a);
  console.log(JSON.stringify(rows7a, null, 2));
}

main().finally(() => prisma.$disconnect());
