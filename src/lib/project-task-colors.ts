/** 팀 프로젝트(Task) 카드·필터용 색상 팔레트 */
export const PROJECT_TASK_COLORS = [
  { value: "#ef4444", label: "빨강" },
  { value: "#f97316", label: "주황" },
  { value: "#eab308", label: "노랑" },
  { value: "#22c55e", label: "초록" },
  { value: "#3b82f6", label: "파랑" },
  { value: "#8b5cf6", label: "보라" },
  { value: "#ec4899", label: "분홍" },
  { value: "#6b7280", label: "회색" },
] as const;

export const PROJECT_TASK_COLOR_SET: Set<string> = new Set(
  PROJECT_TASK_COLORS.map((c) => c.value)
);

export const DEFAULT_PROJECT_CARD_BORDER = "#e5e7eb";

/** 색상 미지정·레거시: 카드 왼쪽 강조에 사용 */
export function getTaskCardAccentColor(color: string | null | undefined): string {
  if (color && PROJECT_TASK_COLOR_SET.has(color)) return color;
  return DEFAULT_PROJECT_CARD_BORDER;
}

export function taskHasPaletteColor(color: string | null | undefined): boolean {
  return typeof color === "string" && PROJECT_TASK_COLOR_SET.has(color);
}

export function isAllowedProjectTaskColor(hex: string | null | undefined): boolean {
  return typeof hex === "string" && PROJECT_TASK_COLOR_SET.has(hex);
}

/** 색상 필터: 팔레트 외 '지정 없음'만 보기 */
export const COLOR_FILTER_DEFAULT_ONLY = "__default__" as const;
