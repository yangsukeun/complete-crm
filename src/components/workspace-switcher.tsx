"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import { Building2, Lock } from "lucide-react";
import {
  useWorkspaceStore,
  workspaceToMode,
  modeToWorkspace,
  type Workspace,
  type WorkspaceState,
} from "@/store/workspace-store";
import { cn } from "@/lib/utils";
import { useLayoutShared } from "@/components/layout-shared-context";

export function WorkspaceSwitcher() {
  const router = useRouter();
  const currentWorkspace = useWorkspaceStore((s: WorkspaceState) => s.currentWorkspace);
  const setWorkspace = useWorkspaceStore((s: WorkspaceState) => s.setWorkspace);

  const handleClick = useCallback(
    async (workspace: Workspace) => {
      flushSync(() => setWorkspace(workspace));
      try {
        await fetch("/api/mode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: workspaceToMode(workspace) }),
        });
      } catch {
        // ignore
      }
      const dashboardUrl = `/dashboard?mode=${workspace}`;
      router.push(dashboardUrl);
      router.refresh();
    },
    [setWorkspace, router]
  );

  return (
    <div
      className="flex shrink-0 rounded-lg border border-border bg-muted/40 p-0.5"
      role="tablist"
      aria-label="워크스페이스 전환"
    >
      <button
        type="button"
        role="tab"
        aria-selected={currentWorkspace === "TEAM"}
        onClick={() => handleClick("TEAM")}
        className={cn(
          "flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
          currentWorkspace === "TEAM"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Building2 className="size-3.5" />
        TEAM
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={currentWorkspace === "MY"}
        onClick={() => handleClick("MY")}
        className={cn(
          "flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
          currentWorkspace === "MY"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Lock className="size-3.5" />
        MY
      </button>
    </div>
  );
}

/** html[data-workspace] 동기화 — 모드는 layout RSC·LayoutShared(appMode)만 사용, GET /api/mode 없음 [PERF-mode-logo] */
export function WorkspaceThemeSync() {
  const currentWorkspace = useWorkspaceStore((s: WorkspaceState) => s.currentWorkspace);
  const setWorkspace = useWorkspaceStore((s: WorkspaceState) => s.setWorkspace);
  const urlMode = useWorkspaceStore((s: WorkspaceState) => s.urlSearchMode);
  const { appMode } = useLayoutShared();

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.workspace = currentWorkspace;
  }, [currentWorkspace]);

  useEffect(() => {
    if (urlMode === "MY" || urlMode === "TEAM") {
      setWorkspace(urlMode);
      return;
    }
    if (appMode === "company" || appMode === "personal") {
      setWorkspace(modeToWorkspace(appMode));
    }
  }, [setWorkspace, urlMode, appMode]);

  return null;
}
