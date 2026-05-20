/**
 * 연차 데이터·로직 정합성 감사 (읽기 전용).
 * npx tsx scripts/audit-leave-system.ts [--as-of=2026-05-19] > leave-audit-report.txt
 */
import "dotenv/config";
import prisma from "../src/lib/prisma";
import { toKstYmd } from "../src/lib/date-kst";
import { completedFullMonthsSinceJoinKst } from "../src/lib/leave";
import { listLeaveAccrualSlots } from "../src/lib/leave/accrual-schedule";
import { LEGACY_CARRY_ACCRUAL_YMD } from "../src/lib/leave/legacy-carry-sync";
import {
  isSickLeaveType,
  leaveRequestDays,
  LEAVE_TYPE_DAYS,
} from "../src/lib/leave/leave-request-days";
import { isExpiredByAsOf, startOfKstDayFromYmd } from "../src/lib/leave/kst-date";
import { buildLeavePoolFromAccruals, tenureBonusDeltaOnAnniversary } from "../src/lib/leave/pure-pool";

type Severity = "ERROR" | "WARN" | "INFO";

type Issue = {
  severity: Severity;
  category: string;
  userName: string;
  userEmail: string;
  detail: string;
};

const issues: Issue[] = [];

function report(
  severity: Severity,
  category: string,
  user: { name: string; email: string },
  detail: string
) {
  issues.push({ severity, category, userName: user.name, userEmail: user.email, detail });
}

function isLegacyCarryRow(type: string, ymd: string): boolean {
  return type === "CARRY_OVER" && ymd === LEGACY_CARRY_ACCRUAL_YMD;
}

const FRACTIONAL_LEAVE_TYPES = new Set(["HALF_AM", "HALF_PM", "QUARTER_AM", "QUARTER_PM"]);

function parseAsOf(): Date {
  const flag = process.argv.find((a) => a.startsWith("--as-of="));
  if (flag) {
    return new Date(`${flag.split("=")[1]}T12:00:00+09:00`);
  }
  return new Date();
}

function parseOutFile(): string | null {
  const flag = process.argv.find((a) => a.startsWith("--out="));
  return flag?.split("=")[1]?.trim() ?? null;
}

/** @param write line printer */
async function runAudit(write: (line: string) => void) {

  const asOf = parseAsOf();
  const asOfYmd = toKstYmd(asOf);

  const users = await prisma.user.findMany({
    where: { joinDate: { not: undefined } },
    orderBy: { name: "asc" },
    include: {
      leaveBalances: true,
      leaveAccruals: { orderBy: { accrualDateYmd: "asc" } },
      leaveRequests: { where: { status: "APPROVED" } },
    },
  });

  write(`\n${"=".repeat(80)}`);
  write(`전체 연차 데이터 감사 (${users.length}명, asOf=${asOfYmd})`);
  write(`${"=".repeat(80)}\n`);

  for (const u of users) {
    const joinDate = u.joinDate;
    const joinYmd = toKstYmd(joinDate);
    const monthsWorked = completedFullMonthsSinceJoinKst(joinYmd, asOfYmd);
    const completedYears = Math.floor(monthsWorked / 12);

    const poolAccruals = u.leaveAccruals.filter((a) => !isLegacyCarryRow(a.type, a.accrualDateYmd));
    const legacyCarry = u.leaveAccruals.filter((a) => isLegacyCarryRow(a.type, a.accrualDateYmd));
    const carryAccruals = u.leaveAccruals.filter(
      (a) => a.type === "CARRY_OVER" && !isLegacyCarryRow(a.type, a.accrualDateYmd)
    );

    // === 검사 1: 1년 미만 manualDeduction / 이월 ===
    for (const b of u.leaveBalances) {
      if (monthsWorked < 12 && (b.manualDeduction ?? 0) > 0.01) {
        report(
          "WARN",
          "1년미만_이전사용분",
          u,
          `year=${b.year} manualDeduction=${b.manualDeduction} (입사 후 ${monthsWorked}개월)`
        );
      }
      if (monthsWorked < 12 && (b.annualCarryOver ?? 0) > 0.01) {
        report(
          "ERROR",
          "1년미만_이월부여",
          u,
          `year=${b.year} annualCarryOver=${b.annualCarryOver} (입사 후 ${monthsWorked}개월 — 이월 불가)`
        );
      }
    }

    const manualDedTotal = u.leaveBalances.reduce((s, b) => s + (b.manualDeduction ?? 0), 0);

    // === 검사 2: 레거시 CARRY(1900) — 의도된 prior/이월 vs 잔재 ===
    for (const lc of legacyCarry) {
      if (lc.isExpired) continue;
      const remaining = lc.days - lc.consumedDays;
      const matchesPrior =
        manualDedTotal > 0.01 &&
        Math.abs(lc.days - manualDedTotal) < 0.01 &&
        Math.abs(lc.consumedDays - manualDedTotal) < 0.01;
      const priorFullyConsumed =
        manualDedTotal > 0.01 &&
        Math.abs(lc.days - manualDedTotal) < 0.01 &&
        remaining <= 0.001;

      if (monthsWorked < 12 && matchesPrior) {
        report(
          "INFO",
          "레거시CARRY_의도된이전사용분",
          u,
          `days=${lc.days} consumed=${lc.consumedDays} (manualDeduction=${manualDedTotal}, 정상)`
        );
        continue;
      }
      if (monthsWorked < 12 && priorFullyConsumed) {
        report(
          "INFO",
          "레거시CARRY_의도된이전사용분",
          u,
          `days=${lc.days} consumed=${lc.consumedDays} (1년 미만 prior 매핑)`
        );
        continue;
      }
      if (monthsWorked < 12) {
        report(
          "ERROR",
          "1년미만_레거시이월행",
          u,
          `CARRY_OVER(1900) days=${lc.days} consumed=${lc.consumedDays} manual=${manualDedTotal}`
        );
        continue;
      }
      if (monthsWorked >= 12 && remaining > 0.001) {
        report(
          "INFO",
          "레거시CARRY_정상이월",
          u,
          `days=${lc.days} 잔여=${remaining.toFixed(2)} (사장님 확인 권장)`
        );
        continue;
      }
      if (remaining <= 0.001) {
        report(
          "WARN",
          "레거시CARRY_잔존",
          u,
          `days=${lc.days} consumed=${lc.consumedDays} 잔여=0 (cleanup-legacy-carry 대상)`
        );
      } else {
        report(
          "WARN",
          "레거시CARRY_잔존",
          u,
          `days=${lc.days} consumed=${lc.consumedDays} 잔여=${remaining.toFixed(2)}`
        );
      }
    }

    if (monthsWorked < 12 && carryAccruals.length > 0) {
      const total = carryAccruals.reduce((s, a) => s + a.days, 0);
      report(
        "ERROR",
        "1년미만_CARRY_OVER레코드",
        u,
        `${carryAccruals.length}건 합 ${total}일 (${carryAccruals.map((a) => a.accrualDateYmd).join(", ")})`
      );
    }

    // === 검사 3·4: 발생 슬롯 vs DB (listLeaveAccrualSlots) ===
    const expectedSlots = listLeaveAccrualSlots(joinDate, asOf);
    const expectedMonthly = expectedSlots.filter((s) => s.type === "MONTHLY_UNDER_ONE_YEAR").length;
    const expectedAnnual = expectedSlots.filter((s) => s.type === "ANNUAL_AFTER_ONE_YEAR").length;
    const expectedBonusSlots = expectedSlots.filter((s) => s.type === "TENURE_BONUS");

    const monthlyAccruals = poolAccruals.filter((a) => a.type === "MONTHLY_UNDER_ONE_YEAR");
    const annualAccruals = poolAccruals.filter((a) => a.type === "ANNUAL_AFTER_ONE_YEAR");
    const bonusAccruals = poolAccruals.filter((a) => a.type === "TENURE_BONUS");

    if (expectedMonthly > monthlyAccruals.length) {
      report(
        "ERROR",
        "월차_발생누락",
        u,
        `기대 ${expectedMonthly}건, 실제 ${monthlyAccruals.length}건 (입사 ${monthsWorked}개월)`
      );
    }
    if (expectedMonthly < monthlyAccruals.length) {
      report(
        "WARN",
        "월차_과다발생",
        u,
        `기대 ${expectedMonthly}건, 실제 ${monthlyAccruals.length}건`
      );
    }

    if (expectedAnnual > annualAccruals.length) {
      report(
        "ERROR",
        "정규연차_발생누락",
        u,
        `기대 ${expectedAnnual}건, 실제 ${annualAccruals.length}건 (${completedYears}주년 기준)`
      );
    }
    if (expectedAnnual < annualAccruals.length) {
      report(
        "WARN",
        "정규연차_과다발생",
        u,
        `기대 ${expectedAnnual}건, 실제 ${annualAccruals.length}건`
      );
    }

    const expectedBonusDays = expectedBonusSlots.reduce((s, x) => s + x.days, 0);
    const actualBonusDays = bonusAccruals.reduce((s, a) => s + a.days, 0);
    if (completedYears >= 3 && Math.abs(expectedBonusDays - actualBonusDays) > 0.01) {
      report(
        "WARN",
        "근속가산_불일치",
        u,
        `기대 누적 ${expectedBonusDays}일(${expectedBonusSlots.length}슬롯), 실제 ${actualBonusDays}일`
      );
    }

    // === 검사 5: LeaveBalance 이월 vs CARRY accrual ===
    const carryBalance = u.leaveBalances.reduce((s, b) => s + (b.annualCarryOver ?? 0), 0);
    const carryAccrualDays = carryAccruals.reduce((s, a) => s + a.days, 0);
    if (monthsWorked >= 12 && carryBalance > 0.01 && carryAccrualDays < carryBalance - 0.01) {
      report(
        "WARN",
        "이월_풀미반영",
        u,
        `LeaveBalance 이월 합 ${carryBalance}일, CARRY_OVER accrual ${carryAccrualDays}일`
      );
    }

    // === 검사 6: 반차·반반차 기간/단위 ===
    for (const r of u.leaveRequests) {
      const t = r.type;
      if (isSickLeaveType(t)) continue;
      const startY = toKstYmd(r.startDate);
      const endY = toKstYmd(r.endDate);
      const sameDay = startY === endY;
      const calc = leaveRequestDays(t, r.startDate, r.endDate);
      const unit = FRACTIONAL_LEAVE_TYPES.has(t) ? LEAVE_TYPE_DAYS[t] : undefined;

      if (unit !== undefined && !sameDay) {
        report(
          "WARN",
          "반차_기간불일치",
          u,
          `${startY}~${endY} type=${t} (단일일 유형인데 다일 신청, calc=${calc})`
        );
      }
      if (unit !== undefined && sameDay && calc > unit + 0.01) {
        report(
          "WARN",
          "반차_단위오류",
          u,
          `${startY} type=${t} 계산=${calc}일 (기대 ${unit}일)`
        );
      }
      if (t === "ANNUAL" && sameDay && calc > 1.01) {
        report("INFO", "연차_다일산정", u, `${startY}~${endY} ANNUAL calc=${calc}일`);
      }
    }

    // === 검사 7: 사용계 (pool consumed vs manual + 승인) ===
    const totalConsumed = poolAccruals.reduce((s, a) => s + a.consumedDays, 0);
    const totalManual = u.leaveBalances.reduce((s, b) => s + (b.manualDeduction ?? 0), 0);
    const approvedUpTo = u.leaveRequests
      .filter((r) => !isSickLeaveType(r.type) && toKstYmd(r.startDate) <= asOfYmd)
      .reduce((s, r) => s + leaveRequestDays(r.type, r.startDate, r.endDate), 0);
    const expectedConsumed = totalManual + approvedUpTo;

    if (Math.abs(totalConsumed - expectedConsumed) > 0.05) {
      report(
        "ERROR",
        "사용계_불일치",
        u,
        `consumedDays=${totalConsumed.toFixed(2)} ≠ 이전사용${totalManual.toFixed(2)}+승인(≤${asOfYmd})${approvedUpTo.toFixed(2)}=${expectedConsumed.toFixed(2)}`
      );
    }

    // === 검사 7b: 승인 휴가 accrualAllocations 누락 ===
    const missingAlloc = u.leaveRequests.filter(
      (r) =>
        !isSickLeaveType(r.type) &&
        toKstYmd(r.startDate) <= asOfYmd &&
        leaveRequestDays(r.type, r.startDate, r.endDate) > 0 &&
        (r.accrualAllocations == null ||
          (Array.isArray(r.accrualAllocations) && r.accrualAllocations.length === 0))
    );
    if (missingAlloc.length > 0) {
      report(
        "WARN",
        "승인_alloc_누락",
        u,
        `${missingAlloc.length}건 (예: ${toKstYmd(missingAlloc[0]!.startDate)} ${missingAlloc[0]!.type}) — API 조회 시 이중 차감 위험`
      );
    }

    // === 검사 8: 소멸 미처리 ===
    const shouldBeExpired = u.leaveAccruals.filter(
      (a) => !a.isExpired && isExpiredByAsOf(a.expiresAt, asOf)
    );
    if (shouldBeExpired.length > 0) {
      report(
        "ERROR",
        "소멸미처리",
        u,
        `${shouldBeExpired.length}건 (가장 오래된: ${shouldBeExpired[0]!.accrualDateYmd}, expiresAt=${shouldBeExpired[0]!.expiresAt.toISOString().slice(0, 10)})`
      );
    }

    // === 검사 9: 풀 행 산수 (레거시 CARRY 제외) ===
    const totalAccrued = poolAccruals.reduce((s, a) => s + a.days, 0);
    let totalExpiredLost = 0;
    let totalAvailable = 0;
    for (const a of poolAccruals) {
      const consumed = Math.min(a.consumedDays, a.days);
      const unconsumed = Math.max(0, a.days - consumed);
      const expired =
        a.isExpired || isExpiredByAsOf(a.expiresAt, asOf);
      if (expired) totalExpiredLost += unconsumed;
      else totalAvailable += unconsumed;
    }
    const sumParts = totalConsumed + totalExpiredLost + totalAvailable;
    if (Math.abs(totalAccrued - sumParts) > 0.05) {
      report(
        "ERROR",
        "산수_불일치",
        u,
        `발생${totalAccrued.toFixed(2)} ≠ 사용${totalConsumed.toFixed(2)}+소멸${totalExpiredLost.toFixed(2)}+잔여${totalAvailable.toFixed(2)}`
      );
    }

    // === 검사 10: 풀 산수 (DB 읽기만, ensure/sync 미호출) ===
    try {
      const inputs = poolAccruals.map((a) => ({
        type: a.type,
        days: a.days,
        consumedDays: a.consumedDays,
        accruedAt: a.accruedAt,
        expiresAt: a.expiresAt,
        isExpired: a.isExpired,
        compensationOwed: a.compensationOwed,
      }));
      const pool = buildLeavePoolFromAccruals(inputs, asOf);
      const sumParts = pool.totalConsumed + pool.totalExpired + pool.available;
      if (Math.abs(pool.totalEntitled - sumParts) > 0.05) {
        report(
          "ERROR",
          "풀산수_불일치",
          u,
          `totalEntitled=${pool.totalEntitled.toFixed(2)} ≠ 사용+소멸+잔여=${sumParts.toFixed(2)}`
        );
      }
    } catch (e) {
      report("ERROR", "풀계산_실패", u, String(e));
    }

    // === 검사 11: 입사일 미래 ===
    if (startOfKstDayFromYmd(joinYmd).getTime() > startOfKstDayFromYmd(asOfYmd).getTime()) {
      report("WARN", "입사일_미래", u, `joinDate=${joinYmd}`);
    }

    // === 검사 12: 발생일이 입사일보다 빠름 ===
    const earlyAccruals = poolAccruals.filter((a) => a.accrualDateYmd < joinYmd);
    if (earlyAccruals.length > 0) {
      report(
        "ERROR",
        "발생일_입사이전",
        u,
        `${earlyAccruals.length}건 (가장 빠른: ${earlyAccruals[0]!.accrualDateYmd})`
      );
    }
  }

  const errors = issues.filter((i) => i.severity === "ERROR").length;
  const warns = issues.filter((i) => i.severity === "WARN").length;
  const infos = issues.filter((i) => i.severity === "INFO").length;

  write(`\n[발견된 이슈: ${issues.length}건 — ERROR ${errors} / WARN ${warns} / INFO ${infos}]\n`);

  const byCategory: Record<string, Issue[]> = {};
  for (const i of issues) {
    byCategory[i.category] ??= [];
    byCategory[i.category].push(i);
  }

  const sortedCats = Object.keys(byCategory).sort();
  for (const cat of sortedCats) {
    const list = byCategory[cat]!;
    const errN = list.filter((i) => i.severity === "ERROR").length;
    const warnN = list.filter((i) => i.severity === "WARN").length;
    const infoN = list.filter((i) => i.severity === "INFO").length;
    write(`▶ ${cat} (ERROR ${errN} / WARN ${warnN} / INFO ${infoN})`);
    for (const i of list) {
      const icon = i.severity === "ERROR" ? "❌" : i.severity === "WARN" ? "⚠" : "ℹ";
      write(`  ${icon} ${i.userName.padEnd(10)} ${i.userEmail.padEnd(28)} | ${i.detail}`);
    }
    write("");
  }

  write(`\n[직원별 종합]\n`);
  const byUser: Record<string, Issue[]> = {};
  for (const i of issues) {
    byUser[i.userName] ??= [];
    byUser[i.userName].push(i);
  }
  const usersWithIssues = Object.keys(byUser).sort();
  const cleanUsers = users
    .map((u) => u.name)
    .filter((n) => !usersWithIssues.includes(n));

  for (const name of usersWithIssues) {
    const list = byUser[name]!;
    write(
      `${name}: ${list.length}개 이슈 (${[...new Set(list.map((i) => i.category))].join(", ")})`
    );
  }
  if (cleanUsers.length > 0) {
    write(`\n이상 없음 (${cleanUsers.length}명): ${cleanUsers.join(", ")}`);
  }

  write(`\n[tenureBonus 참고] 3년차 이상 누적 가산 공식: Σ tenureBonusDeltaOnAnniversary(n)`);
  for (let y = 3; y <= 6; y++) {
    let sum = 0;
    for (let n = 1; n <= y; n++) sum += tenureBonusDeltaOnAnniversary(n);
    write(`  ${y}년차 만근 시 누적 ${sum}일`);
  }
}

async function main() {
  const lines: string[] = [];
  const write = (line: string) => {
    lines.push(line);
    console.log(line);
  };
  await runAudit(write);
  const out = parseOutFile() ?? "leave-audit-report.txt";
  const fs = await import("node:fs/promises");
  await fs.writeFile(out, lines.join("\n") + "\n", "utf8");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
