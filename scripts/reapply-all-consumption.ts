/**
 * 전 직원 LeaveAccrual.consumedDays FIFO 재적용.
 *
 *   npx tsx scripts/reapply-all-consumption.ts --dry-run
 *   npx tsx scripts/reapply-all-consumption.ts --apply
 *   npx tsx scripts/reapply-all-consumption.ts --apply --email complete.st20@gmail.com
 */
import "dotenv/config";
import prisma from "../src/lib/prisma";
import { reapplyLeaveConsumptionForUser } from "../src/lib/leave/reapply-consumption";

const dryRun = process.argv.includes("--dry-run");
const apply = process.argv.includes("--apply");
const emailFlag = process.argv.find((a) => a.startsWith("--email="));
const emailFilter = emailFlag?.split("=")[1]?.trim();
const asOfFlag = process.argv.find((a) => a.startsWith("--as-of="));
const asOf = asOfFlag ? new Date(`${asOfFlag.split("=")[1]}T12:00:00+09:00`) : new Date();

async function main() {
  if (!dryRun && !apply) {
    console.error("--dry-run 또는 --apply 를 지정하세요.");
    process.exit(1);
  }

  const users = await prisma.user.findMany({
    where: {
      joinDate: { not: undefined },
      ...(emailFilter ? { email: emailFilter } : {}),
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  console.log(`대상 ${users.length}명 · mode=${dryRun ? "dry-run" : "apply"} · asOf=${asOf.toISOString()}\n`);

  for (const u of users) {
    const lines = await reapplyLeaveConsumptionForUser(u.id, { dryRun, asOf });
    console.log(lines.join("\n"));
    console.log("");
  }

  console.log("완료.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
