/**
 * 연차 데이터 전체 JSON 백업 (STEP 1).
 * LeaveAccrual · LeaveBalance · LeaveAdjustment · LeaveRequest(승인·할당) 덤프.
 *
 *   npx tsx scripts/backup-leave-data.ts
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import prisma from "../src/lib/prisma";

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function main() {
  const ts = stamp();
  const dir = join(process.cwd(), "backups", "leave", ts);
  mkdirSync(dir, { recursive: true });

  const [accruals, balances, adjustments, leaveRequests, users] = await Promise.all([
    prisma.leaveAccrual.findMany({ orderBy: [{ userId: "asc" }, { accruedAt: "asc" }, { id: "asc" }] }),
    prisma.leaveBalance.findMany({ orderBy: [{ userId: "asc" }, { year: "asc" }] }),
    prisma.leaveAdjustment.findMany({ orderBy: [{ userId: "asc" }, { createdAt: "asc" }] }),
    prisma.leaveRequest.findMany({
      orderBy: [{ userId: "asc" }, { startDate: "asc" }],
    }),
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        joinDate: true,
        accountDisabled: true,
        role: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const serialize = (rows: unknown[]) =>
    JSON.parse(
      JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
    );

  const meta = {
    createdAt: new Date().toISOString(),
    purpose: "연차 데이터 정리 C안 STEP1 백업",
    counts: {
      users: users.length,
      leaveAccruals: accruals.length,
      leaveBalances: balances.length,
      leaveAdjustments: adjustments.length,
      leaveRequests: leaveRequests.length,
    },
  };

  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
  writeFileSync(join(dir, "users.json"), JSON.stringify(serialize(users), null, 2), "utf8");
  writeFileSync(
    join(dir, "leave-accruals.json"),
    JSON.stringify(serialize(accruals), null, 2),
    "utf8"
  );
  writeFileSync(
    join(dir, "leave-balances.json"),
    JSON.stringify(serialize(balances), null, 2),
    "utf8"
  );
  writeFileSync(
    join(dir, "leave-adjustments.json"),
    JSON.stringify(serialize(adjustments), null, 2),
    "utf8"
  );
  writeFileSync(
    join(dir, "leave-requests.json"),
    JSON.stringify(serialize(leaveRequests), null, 2),
    "utf8"
  );

  // 단일 통합 파일 (복구 편의)
  writeFileSync(
    join(dir, "leave-full-dump.json"),
    JSON.stringify(
      {
        meta,
        users: serialize(users),
        leaveAccruals: serialize(accruals),
        leaveBalances: serialize(balances),
        leaveAdjustments: serialize(adjustments),
        leaveRequests: serialize(leaveRequests),
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(JSON.stringify({ ok: true, dir, ...meta.counts }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
