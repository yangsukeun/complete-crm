/**
 * 구글 Tasks → CRM 할일 매핑 (순수 함수, 테스트용).
 * 구글 삭제 전파 없음. 완료는 구글→CRM 단방향 + CRM 완료 시 구글 patch만.
 */

export type GoogleTaskItem = {
  id?: string | null;
  title?: string | null;
  notes?: string | null;
  due?: string | null;
  status?: string | null;
  deleted?: boolean | null;
};

export type CrmGoogleTaskSnapshot = {
  title: string;
  description: string | null;
  dueDate: Date | null;
  isCompleted: boolean;
  projectId: string | null;
};

/** Google Tasks due는 RFC3339이지만 날짜만 의미 있음 → KST 해당일 00:00 */
export function parseGoogleTaskDue(due?: string | null): Date | null {
  if (!due) return null;
  const ymd = due.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return new Date(`${ymd}T00:00:00+09:00`);
}

export function isGoogleTaskCompleted(status?: string | null): boolean {
  return status === "completed";
}

export function googleTaskTitle(title?: string | null): string {
  const t = (title ?? "").trim();
  return t.length > 0 ? t.slice(0, 500) : "(제목 없음)";
}

function dueYmd(d: Date | null): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export type GoogleTaskPlan =
  | { action: "skip"; reason: "no-id" | "deleted" }
  | {
      action: "create";
      googleTaskId: string;
      title: string;
      description: string | null;
      dueDate: Date | null;
      isCompleted: boolean;
    }
  | {
      action: "update";
      googleTaskId: string;
      title: string;
      description: string | null;
      dueDate: Date | null;
      /** 구글이 완료인데 CRM이 미완료일 때만 true. 구글 미완료로 CRM 완료를 되돌리지 않음 */
      completeCrm: boolean;
    };

export function planGoogleTaskChange(
  g: GoogleTaskItem,
  existing: CrmGoogleTaskSnapshot | null
): GoogleTaskPlan {
  const id = typeof g.id === "string" ? g.id.trim() : "";
  if (!id) return { action: "skip", reason: "no-id" };
  if (g.deleted) return { action: "skip", reason: "deleted" };

  const title = googleTaskTitle(g.title);
  const description = g.notes?.trim() ? g.notes : null;
  const dueDate = parseGoogleTaskDue(g.due);
  const googleDone = isGoogleTaskCompleted(g.status);

  if (!existing) {
    return {
      action: "create",
      googleTaskId: id,
      title,
      description,
      dueDate,
      isCompleted: googleDone,
    };
  }

  return {
    action: "update",
    googleTaskId: id,
    title,
    description,
    dueDate,
    completeCrm: googleDone && !existing.isCompleted,
  };
}

export function crmDueUnchanged(a: Date | null, b: Date | null): boolean {
  return dueYmd(a) === dueYmd(b);
}
