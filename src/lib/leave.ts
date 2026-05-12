import { toKstYmd, todayYmdKst } from "@/lib/date-kst";

/**
 * 근로기준법상 연차·월차 발생 기준 요약 (2026 연도 회사 적용 기본값 등에 사용)
 *
 * - 1년 미만: 계속 근로한 「1개월」마다 발생 1일(출근 등 완근 요건 포함, 실무에서는 종업원 수·소정근로일 대비 간이 산정)
 *   발생 상한 통상 최대 **11일** (입사일 KST 기준으로 같은 날짜가 지날 때마다 1개월씩 누적, 1주년 전까지)
 * - 1년 이상 계속 근로: **15일**(그 연도 발생 연차 등과 병합 규칙은 취업규칙·회계 연도별로 따름)
 *
 * 참고: 판단은 **당사 서비스는 입사일(KST)·조회 시점(KST)·회사 설정 상한값**만으로 간이 산정합니다.
 */

export type AnnualLeaveLaborRule = {
  monthlyMaxUnderOneYear: number;
  daysAfterOneFullYear: number;
};

/** 2026년 기준 회사 신규 등록 시 권장 기본 규칙(근기법 일반 근로자 기준 간이 적용값) */
export const LABOR_STANDARD_ANNUAL_LEAVE_KR_2026: AnnualLeaveLaborRule = {
  monthlyMaxUnderOneYear: 11,
  daysAfterOneFullYear: 15,
};

/** DB `CompanyInfo` 연차 재정의(없음/null 이면 위 기본 규칙) */
export type AnnualLeaveCompanyOverrides = {
  annualLeaveMonthlyMaxUnderOneYear?: number | null;
  annualLeaveDaysAfterFirstFullYear?: number | null;
};

export function getCurrentLeaveCalendarYearKst(): number {
  const ymd = todayYmdKst();
  const y = Number(ymd.slice(0, 4));
  return Number.isFinite(y) ? y : new Date().getFullYear();
}

export function resolveAnnualLeaveLaborRule(c: AnnualLeaveCompanyOverrides | null): AnnualLeaveLaborRule {
  return {
    monthlyMaxUnderOneYear:
      typeof c?.annualLeaveMonthlyMaxUnderOneYear === "number" &&
      Number.isFinite(c.annualLeaveMonthlyMaxUnderOneYear)
        ? c.annualLeaveMonthlyMaxUnderOneYear
        : LABOR_STANDARD_ANNUAL_LEAVE_KR_2026.monthlyMaxUnderOneYear,
    daysAfterOneFullYear:
      typeof c?.annualLeaveDaysAfterFirstFullYear === "number" && Number.isFinite(c.annualLeaveDaysAfterFirstFullYear)
        ? c.annualLeaveDaysAfterFirstFullYear
        : LABOR_STANDARD_ANNUAL_LEAVE_KR_2026.daysAfterOneFullYear,
  };
}

/** KST yyyy-MM-dd → 연·월·일 */
function parseKstYmd(ymd: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return { y, m: mo, d };
}

/**
 * 입사일(KST)과 기준일(KST) 사이의 **연·월 보정 만근 월수**
 * 입사 같은 날부터는 「다음달 같은 일」에 한 달 채워짐 (입사 다음날 시작이 아님).
 */
export function completedFullMonthsSinceJoinKst(joinYmd: string, asOfYmd: string): number {
  const a = parseKstYmd(joinYmd);
  const b = parseKstYmd(asOfYmd);
  if (!a || !b) return 0;
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) months -= 1;
  return Math.max(0, months);
}

/**
 * 해당 연도 `year`(당해연도 1~12월)·기준 시점 `asOf`에서의 **근로기준법 간이 발생 연차(+월차 간주) 일수**.
 *
 * - 입사 전·연도 시작 전이면 0.
 * - `cutoff`: `year` 안에서 `asOf`를 해당 연 초~말로 클램프한 KST 일자와 비교한다.
 *
 * 규칙은 `LABOR_STANDARD_ANNUAL_LEAVE_KR_2026` 또는 회사 설정(`resolveAnnualLeaveLaborRule`) 따름.
 */
export function getAnnualLeaveEntitlement(
  joinDate: Date,
  year: number,
  asOf: Date = new Date(),
  laborRule: AnnualLeaveLaborRule = LABOR_STANDARD_ANNUAL_LEAVE_KR_2026
): number {
  const joinYmd = toKstYmd(joinDate);
  const asOfYmd = toKstYmd(asOf);
  const yearStartYmd = `${year}-01-01`;
  const yearEndYmd = `${year}-12-31`;

  if (!joinYmd || !asOfYmd) return 0;

  let cutoffYmd = asOfYmd;
  if (cutoffYmd < yearStartYmd) cutoffYmd = yearStartYmd;
  if (cutoffYmd > yearEndYmd) cutoffYmd = yearEndYmd;

  /** 해당 연 연차 산정에 아직 근무를 시작하지 않음 */
  if (joinYmd > cutoffYmd) return 0;

  const monthsWorked = completedFullMonthsSinceJoinKst(joinYmd, cutoffYmd);
  if (monthsWorked < 1) return 0;

  const { monthlyMaxUnderOneYear, daysAfterOneFullYear } = laborRule;

  if (monthsWorked < 12) {
    return Math.min(monthsWorked, monthlyMaxUnderOneYear);
  }
  return daysAfterOneFullYear;
}
