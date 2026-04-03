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
