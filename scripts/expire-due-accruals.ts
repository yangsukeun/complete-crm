/**
 * 만료 도래 LeaveAccrual 일괄 소멸 (수당 없음).
 *
 *   npx tsx scripts/expire-due-accruals.ts --as-of=2026-05-19
 *   npx tsx scripts/expire-due-accruals.ts --as-of=2026-05-19 --apply
 */
import "dotenv/config";
import prisma from "../src/lib/prisma";
import { markExpiredAccrualsPlain } from "../src/lib/leave/expire-plain";
import { startOfKstDay } from "../src/lib/leave/kst-date";
import { toKstYmd } from "../src/lib/date-kst";

function parseAsOf(): Date {
  const flag = process.argv.find((a) => a.startsWith("--as-of="));
  if (flag) return new Date(`${flag.split("=")[1]}T12:00:00+09:00`);
  return new Date();
}

async function main() {
  const isApply = process.argv.includes("--apply");
  const asOf = parseAsOf();
  const boundary = startOfKstDay(asOf);
  const asOfYmd = toKstYmd(asOf);

  console.log(`기준일: ${asOfYmd} (boundary ${boundary.toISOString()})`);
  console.log(`모드: ${isApply ? "APPLY" : "DRY-RUN"}\n`);

  const due = await prisma.leaveAccrual.findMany({
    where: {
      isExpired: false,
      expiresAt: { lte: boundary },
    },
    include: { user: { select: { name: true, email: true } } },
    orderBy: [{ user: { name: "asc" } }, { expiresAt: "asc" }],
  });

  console.log(`대상: ${due.length}건\n`);

  const byUser: Record<string, typeof due> = {};
  for (const a of due) {
    const key = a.user.name;
    byUser[key] ??= [];
    byUser[key].push(a);
  }

  for (const [name, list] of Object.entries(byUser)) {
    const lostTotal = list.reduce((s, a) => s + Math.max(0, a.days - a.consumedDays), 0);
    console.log(`▶ ${name}: ${list.length}건, 소멸 손실 ${lostTotal.toFixed(2)}일`);
    for (const a of list) {
      const lost = Math.max(0, a.days - a.consumedDays);
      console.log(
        `  ${a.accrualDateYmd} | ${a.type.padEnd(25)} | expiresAt=${toKstYmd(a.expiresAt)} | days=${a.days} consumed=${a.consumedDays} lost=${lost.toFixed(2)}`
      );
    }
    console.log("");
  }

  if (isApply) {
    const count = await markExpiredAccrualsPlain(asOf);
    console.log(`✅ ${count}건 isExpired=true 처리 완료 (compensationOwed 미변경)`);
  } else {
    console.log("(dry-run) --apply 옵션으로 실제 적용");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
