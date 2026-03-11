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
