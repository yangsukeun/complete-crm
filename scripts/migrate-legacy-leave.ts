import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { calculateLeavePool } from "../src/lib/leave/calculate-pool";
import { applyManualLeaveAdjustment } from "../src/lib/leave/apply-manual-adjustment";
import { shouldFillJoinDate } from "../src/lib/employee-import-fill";

const prisma = new PrismaClient();

export const LEGACY_LEAVE_REASON = "구 연차시스템 이관 (2026-08-13 기준)";

const TARGETS: { name: string; target: number }[] = [
  { name: "장윤지", target: 0 },
  { name: "김나린", target: 11.5 },
  { name: "김혜경", target: 15 },
  { name: "이유경", target: 2 },
  { name: "양지원", target: 0.5 },
  { name: "김소윤", target: 12 },
  { name: "김송희", target: 15 },
  { name: "윤태정", target: 17.5 },
  { name: "노혜림", target: 19 },
  { name: "홍지현", target: 15.25 },
  { name: "왕세진", target: 11 },
  { name: "김민애", target: 0 },
  { name: "김미옥", target: 7 },
  { name: "한결", target: 1.75 },
  { name: "윤재원", target: 1 },
  { name: "박인서", target: 0 },
  { name: "박영희", target: 15 },
  { name: "한민성", target: 2 },
  { name: "김수진", target: 3.5 },
  { name: "노영미", target: 6 },
  { name: "이소미", target: 19.25 },
  { name: "김나래", target: -0.5 },
  { name: "윤한선", target: 16 },
  { name: "이은정", target: 17 },
  { name: "문혜빈", target: 4 },
  { name: "송효진", target: 18.25 },
];

const PARENTAL = ["김혜경", "김송희", "윤한선"];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const actor = await prisma.user.findFirst({
    where: { role: { in: ["EXECUTIVE", "ADMIN"] } },
    orderBy: { role: "desc" },
    select: { id: true, name: true },
  });
  if (!actor) throw new Error("조정 실행 관리자 계정이 없습니다.");

  const rows: Record<string, unknown>[] = [];
  const held: string[] = [];
  const skipped: string[] = [];
  const blocked: string[] = [];

  for (const item of TARGETS) {
    const user = await prisma.user.findFirst({
      where: { name: item.name },
      select: { id: true, name: true, joinDate: true, createdAt: true, department: true },
    });
    if (!user) {
      skipped.push(`${item.name}: 계정 없음`);
      rows.push({ name: item.name, target: item.target, crm: null, match: false, action: "skip-no-account" });
      continue;
    }
    const joinMissing = !user.joinDate || shouldFillJoinDate(user.joinDate, user.createdAt);
    if (joinMissing) {
      held.push(`${item.name}${PARENTAL.includes(item.name) ? " (육아휴직)" : ""}`);
      rows.push({ name: item.name, target: item.target, crm: null, match: false, action: "hold-no-joinDate" });
      continue;
    }

    const pool = await calculateLeavePool(user.id);
    const crm = round2(pool.available);
    const delta = round2(item.target - crm);
    const existing = await prisma.leaveAdjustment.findFirst({
      where: { userId: user.id, reason: LEGACY_LEAVE_REASON },
      select: { id: true },
    });

    if (item.target < 0) {
      blocked.push(`${item.name}: 목표 ${item.target} (풀 available은 음수 불가, 현재 ${crm})`);
      rows.push({ name: item.name, target: item.target, crm, match: crm === item.target, action: "blocked-negative" });
      continue;
    }

    if (existing) {
      rows.push({ name: item.name, target: item.target, crm, match: crm === item.target, action: "skip-idempotent" });
      continue;
    }

    if (delta === 0) {
      rows.push({ name: item.name, target: item.target, crm, match: true, action: "none" });
      continue;
    }

    if (delta < 0 && Math.abs(delta) - crm > 0.001) {
      blocked.push(`${item.name}: 차감 ${delta} > 잔여 ${crm}`);
      rows.push({ name: item.name, target: item.target, crm, match: false, action: "blocked-insufficient" });
      continue;
    }

    if (apply) {
      await prisma.$transaction((tx) =>
        applyManualLeaveAdjustment(tx, {
          userId: user.id,
          actorId: actor.id,
          days: delta,
          reason: LEGACY_LEAVE_REASON,
        })
      );
      const after = await calculateLeavePool(user.id);
      const crm2 = round2(after.available);
      rows.push({ name: item.name, target: item.target, crm: crm2, match: crm2 === item.target, action: `applied ${delta}` });
    } else {
      rows.push({ name: item.name, target: item.target, crm, match: crm === item.target, action: `would ${delta}` });
    }
  }

  console.log(JSON.stringify({ apply, actor: actor.name, rows, held, skipped, blocked }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
