/** /help 사이드바·그리드 순서 (DB category id와 동일) */
export const HELP_CATEGORY_NAV = [
  { id: "getting-started", label: "시작하기" },
  { id: "mindmap", label: "마인드맵" },
  { id: "tasks", label: "업무 관리" },
  { id: "projects", label: "프로젝트" },
  { id: "notifications", label: "알림" },
  { id: "admin", label: "관리자", adminOnly: true as const },
] as const;

export type HelpCategoryId = (typeof HELP_CATEGORY_NAV)[number]["id"];

export function categoryLabel(id: string): string {
  const row = HELP_CATEGORY_NAV.find((c) => c.id === id);
  return row?.label ?? id;
}
