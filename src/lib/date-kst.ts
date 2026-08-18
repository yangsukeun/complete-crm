import { startOfDay } from "date-fns";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const KST_WEEKDAY_LABEL = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** UTC 시각 → KST 달력 yyyy-MM-dd (한국은 일광절약 없음, ICU/런타임과 무관하게 동일 결과) */
function utcMsToKstYmd(ms: number): string {
  const kst = new Date(ms + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const kstYmdLongFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

/**
 * ISO/Date 시각을 KST 기준 `M/d (요일) HH:mm` 문자열로 (서버 TZ·브라우저 TZ와 무관, 하이드레이션 안전).
 */
export function formatKstMdEeeHm(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  const m = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const wd = KST_WEEKDAY_LABEL[kst.getUTCDay()] ?? "";
  const h = String(kst.getUTCHours()).padStart(2, "0");
  const min = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${m}/${day} (${wd}) ${h}:${min}`;
}

/**
 * 한국 시간(KST) 기준 해당 날짜의 00:00:00을 UTC Date로 반환.
 * 출퇴근 등 "오늘" 기준 조회 시 서버 타임존과 무관하게 동일한 날짜를 쓰기 위함.
 */
export function startOfDayKst(date: Date): Date {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const kstStart = startOfDay(kst);
  return new Date(kstStart.getTime() - KST_OFFSET_MS);
}

/** 오늘 날짜 YYYY-MM-DD (Asia/Seoul) — AI 업무 마감일 등 */
export function todayYmdKst(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

/**
 * 한국 달력 기준 `YYYY-MM-DD` (스케줄 셀 키·휴가 구간).
 * - `YYYY-MM-DD` 문자열만 오는 값(날짜 전용)은 그대로 키로 사용(의미=한국 영업일).
 * - 그 외 ISO/Date 는 UTC 에폭 + KST 오프셋으로 일자 산출(toLocaleDateString 미사용, 환경 편차 방지).
 */
export function toKstYmd(value: string | Date): string {
  if (typeof value === "string") {
    const t = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return utcMsToKstYmd(d.getTime());
}

/** `yyyy-MM-dd` 한 줄을 한국 로케일로 읽기 쉬운 한 줄로 (다이얼로그 등) */
export function formatKstYmdLongKo(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  return kstYmdLongFormatter.format(new Date(`${ymd}T12:00:00+09:00`));
}

/**
 * ISO/Date → KST `yyyy.MM.dd`.
 * `toISOString().slice(0, 10)` 는 UTC 날짜라 KST 자정(UTC 전날 15:00)에서 하루 밀린다.
 */
export function formatKstYmdDot(value: string | Date): string {
  const ymd = toKstYmd(value);
  return ymd ? ymd.replace(/-/g, ".") : "";
}

/**
 * KST 달력 기준 시작일~종료일(포함)의 `YYYY-MM-DD` 목록.
 * DB에 UTC 자정 등으로 저장된 `LeaveRequest.startDate/endDate`와 월간 캘린더 셀 키를 맞출 때 사용.
 */
export function eachKstYmdInclusive(start: string | Date, end: string | Date): string[] {
  const a = toKstYmd(start);
  const b = toKstYmd(end);
  if (!a || !b || a > b) return [];
  const out: string[] = [];
  let cur = a;
  for (;;) {
    out.push(cur);
    if (cur === b) break;
    const { end: nextDayStart } = kstDateBoundsUtc(cur);
    cur = toKstYmd(nextDayStart);
  }
  return out;
}

/** 시·분만, 24시간제 (Asia/Seoul) — 출퇴근 시각 표시용 */
export function formatKstHm(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * YYYY-MM-DD 를 한국 달력 날짜로 보고, 그날 00:00~24:00 KST 에 해당하는 UTC 구간 [start, end).
 * ActivityLog·AccessLog 등 “이 날짜에 속한 기록” 조회에 사용 (서버 TZ=UTC 에서도 동일).
 */
export function kstDateBoundsUtc(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) {
    throw new TypeError(`Invalid dateStr: ${dateStr}`);
  }
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** 한국 날짜 dateStr 의 전날 YYYY-MM-DD */
export function previousKstYmd(dateStr: string): string {
  const start = new Date(`${dateStr}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) return dateStr;
  const prev = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  return toKstYmd(prev);
}

/** 한국 날짜 dateStr 기준 ±N일 YYYY-MM-DD */
export function addDaysKstYmd(dateStr: string, days: number): string {
  const start = new Date(`${dateStr}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) return dateStr;
  return toKstYmd(new Date(start.getTime() + days * 24 * 60 * 60 * 1000));
}

/** KST 기준 요일 (0=일 … 6=토) */
export function getKstWeekday(date = new Date()): number {
  const ymd = toKstYmd(date);
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 관리자가 고른 YYYY-MM-DD(한국 기준)에 해당하는 Attendance.date 등에 쓰는 UTC 시각 (KST 그날 00:00) */
export function kstYmdToUtcDayStart(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+09:00`);
}
