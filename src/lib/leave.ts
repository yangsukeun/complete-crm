import { differenceInMonths } from "date-fns";

/** 근로기준·연차 산정은 대한민국 달력 기준이므로 Asia/Seoul의 연·월·일만 사용합니다. */
const KST = "Asia/Seoul";

function getKstYmd(d: Date): { y: number; m: number; d: number } {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const [y, mo, day] = s.split("-").map((x) => Number(x));
  return { y, m: mo - 1, d: day };
}

/** KST 달력 (y,m,d)을 월 차(differenceInMonths)용으로만 쓰는 앵커. 한국은 서머타임 없음. */
function kstYmdToUtcAnchor(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d, 12, 0, 0));
}

/**
 * 근로기준법(2026) 기준 연차 부여일수
 * - 1년 미만: 입사일로부터 1개월 만근 시 1일 발생 → 최대 11일
 * - 1년 이상: 15일
 * 기준일 = asOf(기본: 오늘) 기준으로 "현재까지 발생한" 연차
 * - asOf는 해당 연도 범위(start~end)로 클램프됩니다.
 * - 입사일·기준일은 서버 타임존과 무관하게 Asia/Seoul 달력으로만 비교합니다.
 */
export function getAnnualLeaveEntitlement(joinDate: Date, year: number, asOf: Date = new Date()): number {
  const joinParts = getKstYmd(new Date(joinDate));
  const joinAnchor = kstYmdToUtcAnchor(joinParts.y, joinParts.m, joinParts.d);

  const yearStart = kstYmdToUtcAnchor(year, 0, 1);
  const yearEnd = kstYmdToUtcAnchor(year, 11, 31);

  const asOfParts = getKstYmd(new Date(asOf));
  const asOfAnchor = kstYmdToUtcAnchor(asOfParts.y, asOfParts.m, asOfParts.d);

  let cutoffAnchor = asOfAnchor;
  if (asOfAnchor < yearStart) cutoffAnchor = yearStart;
  else if (asOfAnchor > yearEnd) cutoffAnchor = yearEnd;

  if (joinAnchor > cutoffAnchor) return 0;

  const monthsWorked = differenceInMonths(cutoffAnchor, joinAnchor);
  if (monthsWorked < 1) return 0;

  if (monthsWorked < 12) {
    return Math.min(monthsWorked, 11);
  }
  return 15;
}
