import { addDays, addMonths } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { kstYmdToUtcDayStart, toKstYmd } from "@/lib/date-kst";

/** date-fns-tz 기준 KST 달력(근기법 모듈 교차검증·표기용) */
export function kstYmdViaDateFnsTz(d: Date): string {
  return formatInTimeZone(d, "Asia/Seoul", "yyyy-MM-dd");
}

/** KST 달력 `yyyy-MM-dd`에 n일 더한 KST 일자 */
export function addCalendarDaysKst(ymd: string, days: number): string {
  const base = kstYmdToUtcDayStart(ymd);
  return toKstYmd(addDays(base, days));
}

/** 입사일 KST 일자에 n개월 더한 KST 일자(말일 보정은 date-fns addMonths 규칙 따름) */
export function addCalendarMonthsKst(ymd: string, months: number): string {
  const base = new Date(`${ymd}T12:00:00+09:00`);
  return toKstYmd(addMonths(base, months));
}

/** 해당 KST 일의 00:00 KST를 UTC Date로 */
export function startOfKstDayFromYmd(ymd: string): Date {
  return kstYmdToUtcDayStart(ymd);
}

/** Date → KST yyyy-MM-dd (date-kst와 동일 의미) */
export function dateToKstYmd(d: Date): string {
  return toKstYmd(d);
}

/** asOf 시각을 KST 달력 날짜의 00:00 UTC 경계로 */
export function startOfKstDay(d: Date): Date {
  const ymd = toKstYmd(d);
  return kstYmdToUtcDayStart(ymd);
}

/** 발생일 기준 365일 후 첫 무효일 00:00 KST (= 유효 마지막일의 다음날 자정) */
export function expiresAtFromAccrualYmd(accrualYmd: string): Date {
  const firstInvalid = addCalendarDaysKst(accrualYmd, 365);
  return kstYmdToUtcDayStart(firstInvalid);
}

/** asOf가 만료 경계를 지났는지(해당 KST 일부터 사용 불가) */
export function isExpiredByAsOf(expiresAt: Date, asOf: Date): boolean {
  const asOfStart = startOfKstDay(asOf).getTime();
  return asOfStart >= expiresAt.getTime();
}
