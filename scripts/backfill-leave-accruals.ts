/**
 * LeaveAccrual 백필 (실행 전 DB 스냅샷 권장).
 * 사용: npm run db:backfill-leave-accruals -- --dry-run
 */
import "dotenv/config";
import prisma from "../src/lib/prisma";
import { accrueIfDue } from "../src/lib/leave/accrue";
import { ensureLegacyCarryAccrual } from "../src/lib/leave/legacy-carry-sync";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  console.log(`대상 직원 ${users.length}명, dryRun=${dryRun}`);

  for (const u of users) {
    if (dryRun) {
      console.log(`[dry-run] accrueIfDue + ensureLegacyCarry: ${u.email ?? u.id}`);
      continue;
    }
    await accrueIfDue(u.id, new Date());
    await ensureLegacyCarryAccrual(u.id);
  }

  if (!dryRun) {
    console.log("백필 완료. 승인된 휴가 FIFO는 별도 마이그레이션 스크립트가 필요할 수 있습니다.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
