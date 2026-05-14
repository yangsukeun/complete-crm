/**
 * 레거시 CARRY 행이 이미 없는데 LeaveBalance.manualDeduction만 남은 경우,
 * 한 번 더 FIFO 반영합니다. (일반적으로는 `ensureLegacyCarryAccrual`이 API 호출 시 처리)
 *
 *   npx tsx scripts/migrate-prior-usage-to-accruals.ts --dry-run --all-prior
 *   npx tsx scripts/migrate-prior-usage-to-accruals.ts --apply --all-prior
 */
import "dotenv/config";
import prisma from "../src/lib/prisma";
import { ensureAccrualsUpTo } from "../src/lib/leave/ensure-accruals";
import { LEGACY_CARRY_ACCRUAL_YMD } from "../src/lib/leave/legacy-carry-sync";

const dryRun = process.argv.includes("--dry-run");
const apply = process.argv.includes("--apply");
const allPrior = process.argv.includes("--all-prior");

async function fifoPriorOntoAccruals(userId: string, priorTotal: number): Promise<number> {
  if (priorTotal <= 1e-9) return 0;
  const accruals = await prisma.leaveAccrual.findMany({
    where: {
      userId,
      type: { not: "CARRY_OVER" },
      isExpired: false,
    },
    orderBy: [{ accruedAt: "asc" }, { id: "asc" }],
  });

  let left = priorTotal;
  let applied = 0;
  for (const a of accruals) {
    if (left <= 1e-9) break;
    const room = Math.max(0, a.days - a.consumedDays);
    if (room <= 1e-9) continue;
    const take = Math.min(room, left);
    if (!dryRun) {
      await prisma.leaveAccrual.update({
        where: { id: a.id },
        data: { consumedDays: a.consumedDays + take },
      });
    }
    applied += take;
    left -= take;
  }
  if (left > 1e-4) {
    console.warn(`  [warn] userId=${userId} FIFO 미소진 ${left.toFixed(2)}일`);
  }
  return applied;
}

async function migrateUser(userId: string, email: string | null, name: string | null): Promise<void> {
  const legacy = await prisma.leaveAccrual.findUnique({
    where: {
      userId_type_accrualDateYmd: {
        userId,
        type: "CARRY_OVER",
        accrualDateYmd: LEGACY_CARRY_ACCRUAL_YMD,
      },
    },
    select: { id: true },
  });
  if (legacy) {
    console.log(`skip ${name ?? email ?? userId}: 레거시 CARRY 행 있음 → 앱/ API에서 ensureLegacyCarryAccrual이 처리합니다.`);
    return;
  }

  const balances = await prisma.leaveBalance.findMany({
    where: { userId },
    select: { manualDeduction: true },
  });
  const priorTotal = balances.reduce((s, b) => s + (b.manualDeduction ?? 0), 0);
  if (priorTotal <= 1e-6) return;

  console.log(`[${dryRun ? "dry-run" : "apply"}] ${name ?? email ?? userId}: manual=${priorTotal} (레거시 행 없음)`);
  await ensureAccrualsUpTo(userId, new Date());
  const applied = await fifoPriorOntoAccruals(userId, priorTotal);
  console.log(`  → FIFO 반영 ${applied.toFixed(2)}일`);
}

async function main() {
  if (!allPrior) {
    console.error("--all-prior 가 필요합니다. (레거시 CARRY 행은 서버가 자동 처리합니다.)");
    process.exit(1);
  }
  if (!dryRun && !apply) {
    console.error("--dry-run 또는 --apply 를 지정하세요.");
    process.exit(1);
  }

  const users = await prisma.user.findMany({ select: { id: true, email: true, name: true } });
  for (const u of users) {
    await migrateUser(u.id, u.email, u.name);
  }
  console.log("완료.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
