/**
 * 대한민국 법정공휴일·임시공휴일
 * - 법정공휴일: 빨간색 표시
 * - 임시공휴일: 달력에 표기 (날짜 숫자 색상은 법정과 동일하게 빨간색)
 */

export type HolidayType = "legal" | "temporary";

export type HolidayItem = {
  date: string; // YYYY-MM-DD
  name: string;
  type: HolidayType;
};

// 법정공휴일 (고정일): [월, 일]
const LEGAL_FIXED: [number, number][] = [
  [1, 1],   // 신정
  [3, 1],   // 삼일절
  [5, 5],   // 어린이날
  [6, 6],   // 현충일
  [8, 15],  // 광복절
  [10, 3],  // 개천절
  [10, 9],  // 한글날
  [12, 25], // 크리스마스
];

// 설날·추석 (음력 기준 → 양력 변환) 연도별 [시작일 문자열]
// 설날: 1월 말~2월 중순, 추석: 9월 중순~10월 초
const LUNAR_HOLIDAYS: Record<number, { 설날: string[]; 추석: string[] }> = {
  2024: { 설날: ["2024-02-09", "2024-02-10", "2024-02-11"], 추석: ["2024-09-16", "2024-09-17", "2024-09-18"] },
  2025: { 설날: ["2025-01-28", "2025-01-29", "2025-01-30"], 추석: ["2025-10-05", "2025-10-06", "2025-10-07"] },
  2026: { 설날: ["2026-02-16", "2026-02-17", "2026-02-18"], 추석: ["2026-09-24", "2026-09-25", "2026-09-26"] },
  2027: { 설날: ["2027-02-06", "2027-02-07", "2027-02-08"], 추석: ["2027-10-04", "2027-10-05", "2027-10-06"] },
  2028: { 설날: ["2028-01-26", "2028-01-27", "2028-01-28"], 추석: ["2028-09-22", "2028-09-23", "2028-09-24"] },
  2029: { 설날: ["2029-02-13", "2029-02-14", "2029-02-15"], 추석: ["2029-10-11", "2029-10-12", "2029-10-13"] },
  2030: { 설날: ["2030-02-02", "2030-02-03", "2030-02-04"], 추석: ["2030-09-30", "2030-10-01", "2030-10-02"] },
};

// 임시공휴일 (정부 지정 일회성 공휴일) YYYY-MM-DD
const TEMPORARY_HOLIDAYS: Record<string, string> = {
  "2025-08-15": "광복절 80주년 임시공휴일",
  "2025-10-03": "개천절 임시공휴일",
  "2026-02-17": "설날 대체공휴일",
  "2026-09-25": "추석 대체공휴일",
};

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

/** 특정 연도의 모든 공휴일 목록 (법정 + 임시) */
export function getKoreanHolidays(year: number): HolidayItem[] {
  const list: HolidayItem[] = [];

  for (const [month, day] of LEGAL_FIXED) {
    list.push({
      date: `${year}-${pad(month)}-${pad(day)}`,
      name: getLegalHolidayName(month, day),
      type: "legal",
    });
  }

  const lunar = LUNAR_HOLIDAYS[year];
  if (lunar) {
    lunar.설날.forEach((d: any) => list.push({ date: d, name: "설날", type: "legal" }));
    lunar.추석.forEach((d: any) => list.push({ date: d, name: "추석", type: "legal" }));
  }

  for (const [date, name] of Object.entries(TEMPORARY_HOLIDAYS)) {
    if (date.startsWith(String(year))) {
      list.push({ date, name, type: "temporary" });
    }
  }

  return list.sort((a, b) => a.date.localeCompare(b.date));
}

function getLegalHolidayName(month: number, day: number): string {
  const names: Record<string, string> = {
    "1-1": "신정",
    "3-1": "삼일절",
    "5-5": "어린이날",
    "6-6": "현충일",
    "8-15": "광복절",
    "10-3": "개천절",
    "10-9": "한글날",
    "12-25": "크리스마스",
  };
  return names[`${month}-${day}`] ?? "";
}

/** 날짜가 법정공휴일인지 */
export function isLegalHoliday(date: Date): boolean {
  const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const list = getKoreanHolidays(date.getFullYear());
  return list.some((h: any) => h.date === key && h.type === "legal");
}

/** 날짜가 임시공휴일인지 */
export function isTemporaryHoliday(date: Date): boolean {
  const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const list = getKoreanHolidays(date.getFullYear());
  return list.some((h: any) => h.date === key && h.type === "temporary");
}

/** 날짜가 공휴일인지 (법정 또는 임시) */
export function isHoliday(date: Date): boolean {
  const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const list = getKoreanHolidays(date.getFullYear());
  return list.some((h: any) => h.date === key);
}

/** 해당 날짜의 공휴일 이름 (없으면 null) */
export function getHolidayName(date: Date): string | null {
  const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const list = getKoreanHolidays(date.getFullYear());
  const found = list.find((h: any) => h.date === key);
  return found ? found.name : null;
}
