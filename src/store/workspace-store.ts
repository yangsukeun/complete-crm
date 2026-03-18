import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Workspace = "TEAM" | "MY";

const STORAGE_KEY = "crm-workspace";

type WorkspaceState = {
  currentWorkspace: Workspace;
  setWorkspace: (workspace: Workspace) => void;
};

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set: any) => ({
      currentWorkspace: "TEAM" as Workspace,
      setWorkspace: (currentWorkspace: Workspace) => set({ currentWorkspace }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state: any) => ({ currentWorkspace: state.currentWorkspace }),
    }
  )
);

/** 서버/쿠키와 동기화: TEAM = company(팀), MY = personal(개인) */
export function workspaceToMode(workspace: Workspace): "company" | "personal" {
  return workspace === "TEAM" ? "company" : "personal";
}

export function modeToWorkspace(mode: string | null): Workspace {
  return mode === "personal" ? "MY" : "TEAM";
}
