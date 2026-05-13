/**
 * LeaveAccrual 백필 (실행 전 Supabase/DB 스냅샷 권장).
 *
 * npm run db:backfill-leave-accruals -- --dry-run
 * npm run db:backfill-leave-accruals -- --missing-only
 */
import "dotenv/config";
import prisma from "../src/lib/prisma";
import { accrueIfDue, loadLeaveLaborConfig } from "../src/lib/leave/accrue";
import { ensureLegacyCarryAccrual } from "../src/lib/leave/legacy-carry-sync";
import { listLeaveAccrualSlots } from "../src/lib/leave/accrual-schedule";
import { expiresAtFromAccrualYmd, startOfKstDayFromYmd } from "../src/lib/leave/kst-date";
import { toKstYmd } from "../src/lib/date-kst";

const dryRun = process.argv.includes("--dry-run");
const missingOnly = process.argv.includes("--missing-only");
const rebuild = process.argv.includes("--rebuild");

async function main() {
  if (rebuild) {
    console.error(
      "[backfill] --rebuild 는 LeaveAccrual 삭제·FIFO 재매핑으로 승인/사용 이력과 충돌할 수 있어 비활성화했습니다. DB 백업 후 수동 정리하거나 --missing-only 를 사용하세요."
    );
    process.exit(1);
  }

  const asOf = new Date();
  const labor = await loadLeaveLaborConfig();

  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, joinDate: true },
  });
  console.log(
    `대상 직원 ${users.length}명 · dryRun=${dryRun} · missingOnly=${missingOnly} · asOf(KST)=${toKstYmd(asOf)}`
  );

  let wouldInsert = 0;
  let inserted = 0;

  for (const u of users) {
    if (!u.joinDate) continue;
    const joinYmd = toKstYmd(u.joinDate);
    if (!joinYmd) continue;

    if (missingOnly) {
      const slots = listLeaveAccrualSlots(u.joinDate, asOf, {
        monthlyCap: labor.monthlyCap,
        annualDays: labor.annualDays,
      });
      const existing = await prisma.leaveAccrual.findMany({
        where: { userId: u.id },
        select: { type: true, accrualDateYmd: true },
      });
      const key = (t: string, ymd: string) => `${t}\t${ymd}`;
      const have = new Set(existing.map((r) => key(r.type, r.accrualDateYmd)));

      for (const slot of slots) {
        if (have.has(key(slot.type, slot.accrualDateYmd))) continue;

        wouldInsert++;
        const label = `${u.name ?? u.email ?? u.id} · ${slot.type} · ${slot.accrualDateYmd} · ${slot.days}일`;
        if (dryRun) {
          console.log(`[dry-run][missing] ${label}`);
          continue;
        }
        try {
          await prisma.leaveAccrual.create({
            data: {
              userId: u.id,
              type: slot.type,
              days: slot.days,
              accrualDateYmd: slot.accrualDateYmd,
              accruedAt: startOfKstDayFromYmd(slot.accrualDateYmd),
              expiresAt: expiresAtFromAccrualYmd(slot.accrualDateYmd),
              consumedDays: 0,
              note: slot.note ?? null,
            },
          });
          inserted++;
          console.log(`[insert][missing] ${label}`);
        } catch (e) {
          console.warn(`[skip] ${label} (${String(e)})`);
        }
      }
    } else {
      if (dryRun) {
        console.log(`[dry-run] ensureAccrualsUpTo + ensureLegacyCarry: ${u.email ?? u.name ?? u.id}`);
        continue;
      }
      await accrueIfDue(u.id, asOf);
      await ensureLegacyCarryAccrual(u.id);
    }
  }

  if (dryRun && missingOnly) {
    console.log(`[dry-run] 누락 추정 INSERT 건수: ${wouldInsert}`);
  }
  if (!dryRun && missingOnly) {
    console.log(`누락분 INSERT 완료: ${inserted}건 (스캔 대비 ${wouldInsert}건 시도)`);
  }

  if (!dryRun && !missingOnly) {
    console.log("백필 완료(ensureAccrualsUpTo 전 사용자). 승인된 휴가 FIFO는 기존 consumedDays를 유지합니다.");
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
