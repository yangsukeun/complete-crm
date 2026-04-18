/** DB·API에서 마인드맵 캔버스를 구분하는 키 (Project.id 와 겹치지 않도록 예약 문자열 사용) */
export const MINDMAP_CANVAS_ALL = "__ALL__";
export const MINDMAP_CANVAS_UNASSIGNED = "__UNASSIGNED__";

export type MindmapShellMode = "all" | "project" | "unassigned";

export function mindmapCanvasIdFromMode(mode: MindmapShellMode, projectId: string | null | undefined): string {
  if (mode === "all") return MINDMAP_CANVAS_ALL;
  if (mode === "unassigned") return MINDMAP_CANVAS_UNASSIGNED;
  const id = (projectId ?? "").trim();
  return id.length > 0 ? id : MINDMAP_CANVAS_ALL;
}

export function mindmapShellModeFromQuery(v: string | null): MindmapShellMode {
  if (v === "project") return "project";
  if (v === "unassigned") return "unassigned";
  return "all";
}
