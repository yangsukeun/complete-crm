/** 게시판 구분 (API·DB category 문자열과 동일) */
export const BOARD_CATEGORIES = ["COMPANY", "TRAINING", "FREE", "ANONYMOUS", "MEETING"] as const;
export type BoardCategory = (typeof BOARD_CATEGORIES)[number];

export function isBoardCategory(value: string): value is BoardCategory {
  return (BOARD_CATEGORIES as readonly string[]).includes(value);
}

/** URL 쿼리 소문자·공백 등을 정규화. 알 수 없는 값은 회사 자료(COMPANY). */
export function coerceBoardCategory(v: unknown): BoardCategory {
  if (typeof v !== "string") return "COMPANY";
  const u = v.trim().toUpperCase();
  return isBoardCategory(u) ? u : "COMPANY";
}

export function boardCategoryIsAnonymous(category: string): boolean {
  return category === "ANONYMOUS";
}
