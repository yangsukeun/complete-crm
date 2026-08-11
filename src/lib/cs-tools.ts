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

export function sortCsToolCategories(categories: string[]): string[] {
  const rank = (c: string) => {
    const i = (CS_TOOL_CATEGORY_ORDER as readonly string[]).indexOf(c);
    return i === -1 ? 999 : i;
  };
  return [...categories].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, "ko"));
}
