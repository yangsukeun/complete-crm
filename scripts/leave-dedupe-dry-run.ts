/**
 * 연차 Accrual 중복 식별 드라이런 (STEP 2). DB 수정 없음.
 *
 * 규칙: 동일 userId + type + days + 발생일 차 ≤3일 → 중복 후보.
 * 정본: LeaveRequest.accrualAllocations에 물린 행 우선, 그다음 consumedDays>0.
 *
 *   npx tsx scripts/leave-dedupe-dry-run.ts
 *   npx tsx scripts/leave-dedupe-dry-run.ts --out=backups/leave/.../dedupe-dry-run.json
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import prisma from "../src/lib/prisma";
import { toKstYmd } from "../src/lib/date-kst";
import { isExpiredByAsOf } from "../src/lib/leave/kst-date";
import { LEGACY_CARRY_ACCRUAL_YMD } from "../src/lib/leave/legacy-carry-sync";
import {
  buildLeavePoolFromAccruals,
  type AccrualInput,
} from "../src/lib/leave/pure-pool";

type AccRow = {
  id: string;
  userId: string;
  type: string;
  days: number;
  consumedDays: number;
  accrualDateYmd: string;
  accruedAt: Date;
  expiresAt: Date;
  isExpired: boolean;
  compensationOwed: boolean;
  note: string | null;
  createdAt: Date;
};

function ymdToDayNum(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!) / 86400000;
}

function dayDiff(a: string, b: string): number {
  return Math.abs(ymdToDayNum(a) - ymdToDayNum(b));
}

function idPrefix(id: string): string {
  const m = id.match(/^[a-z]+/i);
  return m?.[0] ?? id.slice(0, 4);
}

function collectReferencedAccrualIds(
  requests: { accrualAllocations: unknown }[]
): Set<string> {
  const set = new Set<string>();
  for (const r of requests) {
    const raw = r.accrualAllocations;
    if (!Array.isArray(raw)) continue;
    for (const item of raw as { accrualId?: string }[]) {
      if (typeof item?.accrualId === "string" && item.accrualId) {
        set.add(item.accrualId);
      }
    }
  }
  return set;
}

function pickCanonical(a: AccRow, b: AccRow, referenced: Set<string>): AccRow {
  const aRef = referenced.has(a.id);
  const bRef = referenced.has(b.id);
  if (aRef && !bRef) return a;
  if (bRef && !aRef) return b;
  if (a.consumedDays !== b.consumedDays) {
    return a.consumedDays >= b.consumedDays ? a : b;
  }
  // 동일하면 먼저 생긴 쪽(createdAt) 보존
  if (a.createdAt.getTime() !== b.createdAt.getTime()) {
    return a.createdAt.getTime() <= b.createdAt.getTime() ? a : b;
  }
  return a.id.localeCompare(b.id) <= 0 ? a : b;
}

/** union-find 스타일로 클러스터링: 쌍이 연결되면 한 그룹 */
function clusterDuplicates(rows: AccRow[]): AccRow[][] {
  const n = rows.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    if (parent[i] !== i) parent[i] = find(parent[i]!);
    return parent[i]!;
  };
  const union = (i: number, j: number) => {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = rows[i]!;
      const b = rows[j]!;
      if (a.type !== b.type) continue;
      if (Math.abs(a.days - b.days) > 1e-6) continue;
      if (dayDiff(a.accrualDateYmd, b.accrualDateYmd) > 3) continue;
      union(i, j);
    }
  }

  const map = new Map<number, AccRow[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const list = map.get(r) ?? [];
    list.push(rows[i]!);
    map.set(r, list);
  }
  return [...map.values()].filter((g) => g.length >= 2);
}

function toInput(r: AccRow): AccrualInput {
  return {
    type: r.type as AccrualInput["type"],
    days: r.days,
    consumedDays: r.consumedDays,
    accruedAt: r.accruedAt,
    expiresAt: r.expiresAt,
    isExpired: r.isExpired,
    compensationOwed: r.compensationOwed,
  };
}

async function main() {
  const asOf = new Date();
  const asOfYmd = toKstYmd(asOf);
  const outArg = process.argv.find((a) => a.startsWith("--out="));
  const outPath =
    outArg?.slice(6) ||
    join(
      process.cwd(),
      "backups",
      "leave",
      `dedupe-dry-run-${asOfYmd.replace(/-/g, "")}.json`
    );

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      department: true,
      joinDate: true,
      accountDisabled: true,
    },
    orderBy: { name: "asc" },
  });

  const allAccruals = (await prisma.leaveAccrual.findMany({
    orderBy: [{ userId: "asc" }, { accruedAt: "asc" }, { id: "asc" }],
  })) as AccRow[];

  const allRequests = await prisma.leaveRequest.findMany({
    where: { status: "APPROVED" },
    select: { userId: true, accrualAllocations: true, id: true },
  });

  const referencedGlobal = collectReferencedAccrualIds(allRequests);

  const expiredActiveIssues: {
    userName: string;
    email: string;
    accrualId: string;
    type: string;
    accrualDateYmd: string;
    expiresAt: string;
    isExpired: boolean;
    remaining: number;
  }[] = [];

  const table: {
    name: string;
    email: string;
    department: string | null;
    currentRemaining: number;
    deleteCount: number;
    deleteDaysEntitled: number;
    expectedRemaining: number;
    pairs: {
      keepId: string;
      dropId: string;
      type: string;
      days: number;
      keepYmd: string;
      dropYmd: string;
      dayGap: number;
      keepPrefix: string;
      dropPrefix: string;
      keepConsumed: number;
      dropConsumed: number;
      keepReferenced: boolean;
      dropReferenced: boolean;
      crossPrefix: boolean;
      risk: string | null;
    }[];
  }[] = [];

  let totalDrop = 0;
  const dropIds: string[] = [];

  for (const u of users) {
    const rows = allAccruals.filter(
      (r) =>
        r.userId === u.id &&
        !(r.type === "CARRY_OVER" && r.accrualDateYmd === LEGACY_CARRY_ACCRUAL_YMD)
    );

    for (const r of rows) {
      const expiredByDate = isExpiredByAsOf(r.expiresAt, asOf);
      const rem = Math.max(0, r.days - r.consumedDays);
      if (expiredByDate && !r.isExpired && rem > 1e-6) {
        expiredActiveIssues.push({
          userName: u.name,
          email: u.email,
          accrualId: r.id,
          type: r.type,
          accrualDateYmd: r.accrualDateYmd,
          expiresAt: r.expiresAt.toISOString(),
          isExpired: r.isExpired,
          remaining: rem,
        });
      }
    }

    const poolNow = buildLeavePoolFromAccruals(rows.map(toInput), asOf);
    const clusters = clusterDuplicates(rows);
    const pairs: (typeof table)[0]["pairs"] = [];
    const toDrop = new Set<string>();

    for (const cluster of clusters) {
      // 클러스터에서 정본 1개 선정, 나머지 삭제 후보
      let keep = cluster[0]!;
      for (let i = 1; i < cluster.length; i++) {
        keep = pickCanonical(keep, cluster[i]!, referencedGlobal);
      }
      for (const cand of cluster) {
        if (cand.id === keep.id) continue;
        if (referencedGlobal.has(cand.id)) {
          // 사용 이력 물림 → 삭제 금지, 정본을 이쪽으로 교체
          keep = cand;
        }
      }
      // keep 재확정 후 drop
      for (const cand of cluster) {
        if (cand.id === keep.id) continue;
        if (referencedGlobal.has(cand.id)) {
          pairs.push({
            keepId: keep.id,
            dropId: cand.id,
            type: cand.type,
            days: cand.days,
            keepYmd: keep.accrualDateYmd,
            dropYmd: cand.accrualDateYmd,
            dayGap: dayDiff(keep.accrualDateYmd, cand.accrualDateYmd),
            keepPrefix: idPrefix(keep.id),
            dropPrefix: idPrefix(cand.id),
            keepConsumed: keep.consumedDays,
            dropConsumed: cand.consumedDays,
            keepReferenced: referencedGlobal.has(keep.id),
            dropReferenced: true,
            crossPrefix: idPrefix(keep.id) !== idPrefix(cand.id),
            risk: "SKIP_REFERENCED — 사용 할당이 물려 삭제 제외",
          });
          continue;
        }
        if (cand.consumedDays > 1e-6 && !referencedGlobal.has(keep.id)) {
          // 소비는 있는데 정본에 할당 기록이 없으면 병합 위험
          pairs.push({
            keepId: keep.id,
            dropId: cand.id,
            type: cand.type,
            days: cand.days,
            keepYmd: keep.accrualDateYmd,
            dropYmd: cand.accrualDateYmd,
            dayGap: dayDiff(keep.accrualDateYmd, cand.accrualDateYmd),
            keepPrefix: idPrefix(keep.id),
            dropPrefix: idPrefix(cand.id),
            keepConsumed: keep.consumedDays,
            dropConsumed: cand.consumedDays,
            keepReferenced: referencedGlobal.has(keep.id),
            dropReferenced: false,
            crossPrefix: idPrefix(keep.id) !== idPrefix(cand.id),
            risk: "MERGE_CONSUMED — 삭제 전 consumedDays를 정본에 합산 필요",
          });
          toDrop.add(cand.id);
          continue;
        }
        pairs.push({
          keepId: keep.id,
          dropId: cand.id,
          type: cand.type,
          days: cand.days,
          keepYmd: keep.accrualDateYmd,
          dropYmd: cand.accrualDateYmd,
          dayGap: dayDiff(keep.accrualDateYmd, cand.accrualDateYmd),
          keepPrefix: idPrefix(keep.id),
          dropPrefix: idPrefix(cand.id),
          keepConsumed: keep.consumedDays,
          dropConsumed: cand.consumedDays,
          keepReferenced: referencedGlobal.has(keep.id),
          dropReferenced: false,
          crossPrefix: idPrefix(keep.id) !== idPrefix(cand.id),
          risk: cand.consumedDays > 1e-6 ? "MERGE_CONSUMED" : null,
        });
        toDrop.add(cand.id);
      }
    }

    const remainingRows = rows.filter((r) => !toDrop.has(r.id));
    // MERGE_CONSUMED: 삭제 후보 consumed를 정본에 가상 합산
    const merged = remainingRows.map((r) => {
      const extras = pairs.filter(
        (p) =>
          p.keepId === r.id &&
          toDrop.has(p.dropId) &&
          (p.risk === "MERGE_CONSUMED" || p.risk === "MERGE_CONSUMED — 삭제 전 consumedDays를 정본에 합산 필요")
      );
      if (extras.length === 0) return r;
      const add = extras.reduce((s, p) => s + p.dropConsumed, 0);
      return { ...r, consumedDays: r.consumedDays + add };
    });

    const poolAfter = buildLeavePoolFromAccruals(merged.map(toInput), asOf);
    const deleteDays = [...toDrop].reduce((s, id) => {
      const row = rows.find((r) => r.id === id);
      return s + (row?.days ?? 0);
    }, 0);

    for (const id of toDrop) {
      dropIds.push(id);
      totalDrop += 1;
    }

    table.push({
      name: u.name,
      email: u.email,
      department: u.department,
      currentRemaining: Math.round(poolNow.available * 100) / 100,
      deleteCount: toDrop.size,
      deleteDaysEntitled: Math.round(deleteDays * 100) / 100,
      expectedRemaining: Math.round(poolAfter.available * 100) / 100,
      pairs,
    });
  }

  // 원인 분석: isExpired 미갱신 vs 계산이 만료 무시
  const expireCause = {
    summary:
      "풀 계산(buildLeavePoolFromAccruals)은 isExpired 또는 expiresAt≤asOf 이면 만료로 처리(잔여에서 제외). " +
      "다만 isExpired=false 인 채 expiresAt이 지난 행은 DB 플래그 스윕 누락이며, " +
      "표시 발생(totalEntitled)은 만료분 days도 합산해 생애 누적이 부풀어 보임.",
    staleFlagCount: expiredActiveIssues.length,
    note:
      expiredActiveIssues.length > 0
        ? "만료일 지났는데 isExpired=false — expire 스윕 누락(잔여는 날짜 기준으로 이미 제외될 수 있음)."
        : "만료일 경과·isExpired=false·잔여>0 조합 없음. 발생 수치 부풀림은 주로 생애 days 합산(+중복 행).",
  };

  const report = {
    asOf: asOf.toISOString(),
    asOfYmd,
    totalUsers: users.length,
    totalDropCandidates: totalDrop,
    dropIds,
    expireCause,
    expiredActiveIssues,
    table: table.sort((a, b) => b.deleteCount - a.deleteCount || a.name.localeCompare(b.name, "ko")),
  };

  mkdirSync(join(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  // 콘솔 표
  console.log(`\n=== 중복 삭제 드라이런 (asOf=${asOfYmd}) 삭제 예정 ${totalDrop}행 ===\n`);
  console.log(
    "이름".padEnd(10) +
      "현재잔여".padStart(8) +
      "삭제행".padStart(6) +
      "삭제부여".padStart(8) +
      "예상잔여".padStart(8)
  );
  for (const r of report.table) {
    if (r.deleteCount === 0 && Math.abs(r.currentRemaining - r.expectedRemaining) < 0.01) {
      // still print all per user request
    }
    console.log(
      r.name.slice(0, 8).padEnd(10) +
        String(r.currentRemaining).padStart(8) +
        String(r.deleteCount).padStart(6) +
        String(r.deleteDaysEntitled).padStart(8) +
        String(r.expectedRemaining).padStart(8)
    );
  }
  console.log(`\n만료 플래그 스윕 이슈: ${expiredActiveIssues.length}건`);
  console.log(`보고서: ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
