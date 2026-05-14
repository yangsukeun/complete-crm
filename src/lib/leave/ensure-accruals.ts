import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { toKstYmd } from "@/lib/date-kst";
import { loadLeaveLaborConfig } from "@/lib/leave/labor-config";
import {
  addCalendarMonthsKst,
  expiresAtFromAccrualYmd,
  startOfKstDayFromYmd,
} from "@/lib/leave/kst-date";
import { tenureBonusDeltaOnAnniversary } from "@/lib/leave/pure-pool";

export type EnsureAccrualsResult = { created: number; skipped: number };

/**
 * 입사일(KST) 기준 asOf까지 도래한 LeaveAccrual을 idempotent 생성.
 * 기존 (userId, type, accrualDateYmd) 행이 있으면 건너뜀.
 */
export async function ensureAccrualsUpTo(
  userId: string,
  asOf: Date = new Date()
): Promise<EnsureAccrualsResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, joinDate: true },
  });
  if (!user?.joinDate) {
    console.log(`[ensureAccruals] skip ${userId}: no joinDate`);
    return { created: 0, skipped: 0 };
  }

  const joinYmd = toKstYmd(user.joinDate);
  if (!joinYmd || !/^\d{4}-\d{2}-\d{2}$/.test(joinYmd)) {
    console.log(`[ensureAccruals] skip ${userId}: invalid joinYmd`);
    return { created: 0, skipped: 0 };
  }

  const todayStart = startOfKstDayFromYmd(toKstYmd(asOf)).getTime();
  const joinStart = startOfKstDayFromYmd(joinYmd).getTime();

  if (joinStart > todayStart) {
    console.log(`[ensureAccruals] skip ${userId}: future joinDate`);
    return { created: 0, skipped: 0 };
  }

  const { annualDays, monthlyCap } = await loadLeaveLaborConfig();
  let created = 0;
  let skipped = 0;

  const tryCreate = async (data: Prisma.LeaveAccrualUncheckedCreateInput) => {
    const existing = await prisma.leaveAccrual.findUnique({
      where: {
        userId_type_accrualDateYmd: {
          userId,
          type: data.type,
          accrualDateYmd: data.accrualDateYmd,
        },
      },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      return;
    }
    await prisma.leaveAccrual.create({ data });
    created++;
  };

  const maxMonthly = Math.min(11, monthlyCap);
  for (let m = 1; m <= maxMonthly; m++) {
    const accrualDateYmd = addCalendarMonthsKst(joinYmd, m);
    if (startOfKstDayFromYmd(accrualDateYmd).getTime() > todayStart) break;

    await tryCreate({
      userId,
      type: "MONTHLY_UNDER_ONE_YEAR",
      days: 1,
      accrualDateYmd,
      accruedAt: startOfKstDayFromYmd(accrualDateYmd),
      expiresAt: expiresAtFromAccrualYmd(accrualDateYmd),
      note: `§60② ${m}개월차`,
    });
  }

  for (let n = 1; n <= 50; n++) {
    const accrualDateYmd = addCalendarMonthsKst(joinYmd, 12 * n);
    if (startOfKstDayFromYmd(accrualDateYmd).getTime() > todayStart) break;

    await tryCreate({
      userId,
      type: "ANNUAL_AFTER_ONE_YEAR",
      days: annualDays,
      accrualDateYmd,
      accruedAt: startOfKstDayFromYmd(accrualDateYmd),
      expiresAt: expiresAtFromAccrualYmd(accrualDateYmd),
      note: n === 1 ? "§60① 1주년" : `§60① ${n}주년`,
    });

    const bonus = tenureBonusDeltaOnAnniversary(n);
    if (bonus > 0.00001) {
      await tryCreate({
        userId,
        type: "TENURE_BONUS",
        days: bonus,
        accrualDateYmd,
        accruedAt: startOfKstDayFromYmd(accrualDateYmd),
        expiresAt: expiresAtFromAccrualYmd(accrualDateYmd),
        note: `§60④ ${n}주년 가산`,
      });
    }
  }

  console.log(`[ensureAccruals] user=${userId} created=${created} skipped=${skipped}`);
  return { created, skipped };
}
