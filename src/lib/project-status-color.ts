/** 캘린더·UI에서 공통 사용 — Prisma `ProjectStatus` 와 동일 키 */
export type ProjectStatusKey = "PREPARING" | "IN_PROGRESS" | "COMPLETED" | "ON_HOLD";

export const PROJECT_STATUS_CHIP: Record<
  ProjectStatusKey,
  { accent: string; light: string; text: string }
> = {
  PREPARING: { accent: "#F59E0B", light: "#FEF3C7", text: "#78350F" },
  IN_PROGRESS: { accent: "#3B82F6", light: "#DBEAFE", text: "#1E3A8A" },
  COMPLETED: { accent: "#6B7280", light: "#F3F4F6", text: "#374151" },
  ON_HOLD: { accent: "#8B5CF6", light: "#EDE9FE", text: "#4C1D95" },
};

export function normalizeProjectStatus(v: string | null | undefined): ProjectStatusKey {
  if (v === "IN_PROGRESS" || v === "COMPLETED" || v === "ON_HOLD" || v === "PREPARING") return v;
  return "PREPARING";
}
