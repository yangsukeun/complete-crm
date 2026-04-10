import { startOfDay } from "date-fns";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

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
  return prev.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

/** 관리자가 고른 YYYY-MM-DD(한국 기준)에 해당하는 Attendance.date 등에 쓰는 UTC 시각 (KST 그날 00:00) */
export function kstYmdToUtcDayStart(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+09:00`);
}
