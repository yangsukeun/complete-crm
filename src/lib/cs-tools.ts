import type { ChipTone } from "@/lib/color-chip";

/** CS 링크 허브 카테고리 표시 순서 */
export const CS_TOOL_CATEGORY_ORDER = [
  "관리·보고",
  "매뉴얼",
  "통계·분석",
  "커뮤니티",
  "교육",
  "AI 답변생성",
  "기타",
] as const;

export type CsToolCategory = (typeof CS_TOOL_CATEGORY_ORDER)[number];

/** 카테고리 → 칩 톤. 교육은 orange 대신 yellow 재사용. 미등록은 gray. */
export const CS_TOOL_CATEGORY_TONE: Record<CsToolCategory, ChipTone> = {
  "관리·보고": "blue",
  "매뉴얼": "green",
  "통계·분석": "purple",
  "커뮤니티": "pink",
  "교육": "yellow",
  "AI 답변생성": "yellow",
  "기타": "gray",
};

export function csToolCategoryTone(category: string): ChipTone {
  if (category in CS_TOOL_CATEGORY_TONE) {
    return CS_TOOL_CATEGORY_TONE[category as CsToolCategory];
  }
  return "gray";
}

export function sortCsToolCategories(categories: string[]): string[] {
  const rank = (c: string) => {
    const i = (CS_TOOL_CATEGORY_ORDER as readonly string[]).indexOf(c);
    return i === -1 ? 999 : i;
  };
  return [...categories].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "ko"));
}
