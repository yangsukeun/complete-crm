import { create } from "zustand";

export type Workspace = "TEAM" | "MY";

type WorkspaceState = {
  currentWorkspace: Workspace;
  setWorkspace: (workspace: Workspace) => void;
};

// localStorage/persist 초기화 꼬임으로 런타임 store null 오류가 나지 않도록
// 단순 메모리 store로 유지하고, 서버/쿠키 동기화는 API로 처리한다.
export const useWorkspaceStore = create<WorkspaceState>((set: any) => ({
  currentWorkspace: "TEAM" as Workspace,
  setWorkspace: (currentWorkspace: Workspace) => set({ currentWorkspace }),
}));

/** 서버/쿠키와 동기화: TEAM = company(팀), MY = personal(개인) */
export function workspaceToMode(workspace: Workspace): "company" | "personal" {
  return workspace === "TEAM" ? "company" : "personal";
}

export function modeToWorkspace(mode: string | null): Workspace {
  return mode === "personal" ? "MY" : "TEAM";
}
