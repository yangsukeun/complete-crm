/** 게시판 구분 (API·DB category 문자열과 동일) */
export const BOARD_CATEGORIES = ["COMPANY", "TRAINING", "FREE", "ANONYMOUS"] as const;
export type BoardCategory = (typeof BOARD_CATEGORIES)[number];

export function isBoardCategory(value: string): value is BoardCategory {
  return (BOARD_CATEGORIES as readonly string[]).includes(value);
}

export function boardCategoryIsAnonymous(category: string): boolean {
  return category === "ANONYMOUS";
}
