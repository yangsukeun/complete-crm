/** 단계 API 응답 타입 (src/lib/task-stages.ts 의 serializeStage 와 같은 모양) */
export type StageStatus = "PENDING" | "ACTIVE" | "DONE";

export type StageAssigneeView = {
  userId: string;
  name: string;
  position: string | null;
  department: string | null;
  progress: number;
  lastNote: string | null;
  lastSavedAt: string | null;
  completedAt: string | null;
};

export type StageView = {
  id: string;
  number: number;
  name: string;
  status: StageStatus;
  startedAt: string | null;
  completedAt: string | null;
  progress: number;
  doneCount: number;
  assignees: StageAssigneeView[];
};

export type StageCandidate = {
  id: string;
  name: string;
  position: string | null;
  department: string | null;
};

export type TaskStagesResponse = {
  taskId: string;
  taskTitle: string;
  canEdit: boolean;
  overallProgress: number;
  stages: StageView[];
  candidates: StageCandidate[];
};

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  PENDING: "대기",
  ACTIVE: "진행 중",
  DONE: "완료",
};

export const STAGE_STATUS_CLASS: Record<StageStatus, string> = {
  PENDING: "border-gray-200 bg-gray-50 text-gray-600",
  ACTIVE: "border-sky-300 bg-sky-50 text-sky-800",
  DONE: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

export async function stageFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || "요청을 처리하지 못했습니다.");
  return body;
}
