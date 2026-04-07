import { useWorkspaceStore } from "@/store/workspace-store";

/** 클라이언트에서 /api/* 호출 시 쿠키와 동기화 — TEAM/PERSONAL 과제 조회 일치 */
export function getXWorkspaceHeader(): "MY" | "TEAM" {
  const { urlSearchMode, currentWorkspace } = useWorkspaceStore.getState();
  if (urlSearchMode === "MY" || urlSearchMode === "TEAM") return urlSearchMode;
  return currentWorkspace === "MY" ? "MY" : "TEAM";
}

export function workspaceFetchHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set("x-workspace", getXWorkspaceHeader());
  return h;
}
