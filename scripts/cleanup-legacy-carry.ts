/**
 * 레거시 CARRY_OVER(1900-01-01) 중 잔여 0인 행만 isExpired 처리 (읽기 후 --apply).
 *
 *   npx tsx scripts/cleanup-legacy-carry.ts
 *   npx tsx scripts/cleanup-legacy-carry.ts --apply
 *   npx tsx scripts/cleanup-legacy-carry.ts --email=bscomplete2020@naver.com --force-expire --apply
 */
import "dotenv/config";
import prisma from "../src/lib/prisma";
import { LEGACY_CARRY_ACCRUAL_YMD } from "../src/lib/leave/legacy-carry-sync";

/** 사장님 결정: manualDeduction 매핑용 레거시 행 유지 */
const SKIP_EMAILS = new Set(["jwm0del93@gmail.com"]);

async function main() {
  const isApply = process.argv.includes("--apply");
  const forceExpire = process.argv.includes("--force-expire");
  const emailFlag = process.argv.find((a) => a.startsWith("--email="));
  const emailFilter = emailFlag?.split("=")[1]?.trim();

  const targets = await prisma.leaveAccrual.findMany({
    where: {
      type: "CARRY_OVER",
      accrualDateYmd: LEGACY_CARRY_ACCRUAL_YMD,
      isExpired: false,
      ...(emailFilter ? { user: { email: emailFilter } } : {}),
    },
    include: { user: { select: { name: true, email: true } } },
    orderBy: [{ user: { name: "asc" } }],
  });

  console.log(`총 ${targets.length}건의 레거시 CARRY_OVER(미소멸)\n`);

  let toExpire = 0;
  let toSkip = 0;
  const expiredAt = new Date();

  for (const a of targets) {
    const remaining = Math.max(0, a.days - a.consumedDays);
    const skipUser = SKIP_EMAILS.has(a.user.email);

    if (skipUser) {
      console.log(
        `🔒 ${a.user.name}: days=${a.days} consumed=${a.consumedDays} — 유지(사장님 결정, 김정우)`
      );
      toSkip++;
      continue;
    }

    if (remaining > 0.001 && !forceExpire) {
      console.log(
        `⏸ ${a.user.name}: days=${a.days} consumed=${a.consumedDays} 잔여=${remaining.toFixed(2)} — 사장님 확인 필요`
      );
      toSkip++;
      continue;
    }

    if (forceExpire && remaining > 0.001) {
      console.log(
        `⚠ ${a.user.name}: 잔여 ${remaining.toFixed(2)}일 — --force-expire로 소멸 처리`
      );
    } else {
      console.log(
        `✅ ${a.user.name}: days=${a.days} consumed=${a.consumedDays} 잔여=0 → 정리 대상`
      );
    }
    toExpire++;

    if (isApply) {
      await prisma.leaveAccrual.update({
        where: { id: a.id },
        data: { isExpired: true, expiredAt },
      });
    }
  }

  console.log(`\n정리 대상: ${toExpire}건 (${isApply ? "적용됨" : "dry-run"})`);
  console.log(`보류: ${toSkip}건`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
