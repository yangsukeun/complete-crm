/**
 * 전 직원 LeaveAccrual 백필 (ensureAccrualsUpTo). 승인된 LeaveRequest는 변경하지 않음.
 *
 *   npx tsx scripts/run-accrual-backfill.ts
 */
import "dotenv/config";
import prisma from "../src/lib/prisma";
import { ensureAccrualsUpTo } from "../src/lib/leave/ensure-accruals";
import { ensureLegacyCarryAccrual } from "../src/lib/leave/legacy-carry-sync";

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
  });

  console.log(`Processing ${users.length} users...`);

  for (const u of users) {
    try {
      const r = await ensureAccrualsUpTo(u.id);
      await ensureLegacyCarryAccrual(u.id);
      console.log(`✓ ${u.name} (${u.email}): created=${r.created} skipped=${r.skipped}`);
    } catch (e) {
      console.error(`✗ ${u.name}: ${e}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
