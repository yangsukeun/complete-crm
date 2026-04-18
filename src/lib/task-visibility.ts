import { subDays } from "date-fns";

export type TaskCompletionShelf = "active" | "recent" | "all";

/** 목록·마인드맵 공통: /api/tasks 쿼리 조각 (?status / ?completedAfter / ?includeArchived) */
export function taskCompletionShelfQuery(shelf: TaskCompletionShelf): string {
  const sp = new URLSearchParams();
  if (shelf === "active") {
    sp.set("status", "TODO,IN_PROGRESS");
  } else if (shelf === "recent") {
    sp.set("status", "TODO,IN_PROGRESS,DONE");
    sp.set("completedAfter", subDays(new Date(), 7).toISOString());
  } else {
    sp.set("includeArchived", "1");
  }
  return sp.toString();
}

/** 완료 후 3일 경과 시 마인드맵에서 기본 접힘(서버가 defaultCollapsed 로 안내) */
export function taskDefaultCollapsed(task: {
  status: string;
  completedAt: Date | null | undefined;
}): boolean {
  if (task.status !== "DONE") return false;
  if (task.completedAt == null) return false;
  return task.completedAt.getTime() < subDays(new Date(), 3).getTime();
}

export function getDefaultCollapsedIds<T extends { id: string; status: string; completedAt: Date | null | undefined }>(
  tasks: T[]
): string[] {
  return tasks.filter((t) => taskDefaultCollapsed(t)).map((t) => t.id);
}
