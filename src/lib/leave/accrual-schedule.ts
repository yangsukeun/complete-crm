import { formatInTimeZone } from "date-fns-tz";
import { completedFullMonthsSinceJoinKst } from "@/lib/leave";
import { addCalendarMonthsKst, startOfKstDay, startOfKstDayFromYmd } from "@/lib/leave/kst-date";
import { tenureBonusDeltaOnAnniversary } from "@/lib/leave/pure-pool";

const KST = "Asia/Seoul";

export type LeaveAccrualSlotType = "MONTHLY_UNDER_ONE_YEAR" | "ANNUAL_AFTER_ONE_YEAR" | "TENURE_BONUS";

export type LeaveAccrualSlot = {
  type: LeaveAccrualSlotType;
  accrualDateYmd: string;
  days: number;
  note: string;
  /** §60② 월차 출근율 구간용 (1~11) */
  monthIndex1Based?: number;
  /** 입사 기념 연차(§60①) · 근속가산(§60④) 판단용 */
  anniversaryYear?: number;
};

function kstYmd(d: Date): string {
  return formatInTimeZone(d, KST, "yyyy-MM-dd");
}

/**
 * 입사일·기준일을 KST 달력으로 보고, asOf 시점까지 도래한 발생 슬롯(출근율·DB 여부와 무관).
 * 크론/백필·단위 테스트의 기대 스케줄 단일 출처.
 */
export function listLeaveAccrualSlots(
  joinedAt: Date,
  asOf: Date,
  opts?: { monthlyCap?: number; annualDays?: number }
): LeaveAccrualSlot[] {
  const joinYmd = kstYmd(joinedAt);
  const asOfYmd = kstYmd(asOf);
  if (!joinYmd || !asOfYmd || !/^\d{4}-\d{2}-\d{2}$/.test(joinYmd)) return [];

  const monthlyCap = opts?.monthlyCap ?? 11;
  const annualDays = opts?.annualDays ?? 15;
  const completedMonths = completedFullMonthsSinceJoinKst(joinYmd, asOfYmd);
  const maxMonthly = Math.min(monthlyCap, completedMonths);
  const asOfStart = startOfKstDay(asOf).getTime();

  const out: LeaveAccrualSlot[] = [];

  for (let m = 1; m <= maxMonthly; m++) {
    const accrualDateYmd = addCalendarMonthsKst(joinYmd, m);
    if (startOfKstDayFromYmd(accrualDateYmd).getTime() > asOfStart) continue;
    out.push({
      type: "MONTHLY_UNDER_ONE_YEAR",
      accrualDateYmd,
      days: 1,
      note: `§60② ${m}개월차`,
      monthIndex1Based: m,
    });
  }

  for (let annYear = 1; annYear <= 50; annYear++) {
    const accrualDateYmd = addCalendarMonthsKst(joinYmd, 12 * annYear);
    if (startOfKstDayFromYmd(accrualDateYmd).getTime() > asOfStart) break;
    out.push({
      type: "ANNUAL_AFTER_ONE_YEAR",
      accrualDateYmd,
      days: annualDays,
      note: annYear === 1 ? "§60① 1주년" : `§60① ${annYear}주년`,
      anniversaryYear: annYear,
    });
    const bonus = tenureBonusDeltaOnAnniversary(annYear);
    if (bonus > 0) {
      out.push({
        type: "TENURE_BONUS",
        accrualDateYmd,
        days: bonus,
        note: `§60④ ${annYear}주년 가산`,
        anniversaryYear: annYear,
      });
    }
  }

  const typeOrder: Record<LeaveAccrualSlotType, number> = {
    MONTHLY_UNDER_ONE_YEAR: 0,
    ANNUAL_AFTER_ONE_YEAR: 1,
    TENURE_BONUS: 2,
  };
  return out.sort((a, b) => {
    const ta = startOfKstDayFromYmd(a.accrualDateYmd).getTime();
    const tb = startOfKstDayFromYmd(b.accrualDateYmd).getTime();
    if (ta !== tb) return ta - tb;
    return typeOrder[a.type] - typeOrder[b.type];
  });
}

/** 테스트·백필용 — 슬롯을 `accruedAt`(KST 해당일 00:00 UTC) 포함 형태로 */
export function generateAccruals(
  joinedAt: Date,
  asOf: Date,
  opts?: { monthlyCap?: number; annualDays?: number }
): Array<LeaveAccrualSlot & { accruedAt: Date }> {
  return listLeaveAccrualSlots(joinedAt, asOf, opts).map((s) => ({
    ...s,
    accruedAt: startOfKstDayFromYmd(s.accrualDateYmd),
  }));
}
