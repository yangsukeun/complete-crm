"use client";

import { Suspense, useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { flushSync } from "react-dom";
import { Building2, Lock } from "lucide-react";
import { useWorkspaceStore, workspaceToMode, modeToWorkspace, type Workspace } from "@/store/workspace-store";
import { cn } from "@/lib/utils";

export function WorkspaceSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const currentWorkspace = useWorkspaceStore((s: any) => s.currentWorkspace);
  const setWorkspace = useWorkspaceStore((s: any) => s.setWorkspace);

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

/** useSearchParams는 Suspense 안에서만 써야 RSC 하이드레이션(React #419)이 안 납니다. */
function WorkspaceThemeSyncInner() {
  const currentWorkspace = useWorkspaceStore((s: any) => s.currentWorkspace);
  const setWorkspace = useWorkspaceStore((s: any) => s.setWorkspace);
  const urlMode = useSearchParams().get("mode");

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.workspace = currentWorkspace;
  }, [currentWorkspace]);

  useEffect(() => {
    if (urlMode === "MY" || urlMode === "TEAM") {
      setWorkspace(urlMode);
      return;
    }
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      fetch("/api/mode")
        .then((r: any) => (r.ok ? r.json() : { mode: null }))
        .then((d: any) => {
          if (cancelled) return;
          setWorkspace(modeToWorkspace(d.mode ?? null));
        })
        .catch(() => {});
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [setWorkspace, urlMode]);

  return null;
}

/** html[data-workspace] 동기화 + 초기 로드 시 쿠키와 스토어 동기화 */
export function WorkspaceThemeSync() {
  return (
    <Suspense fallback={null}>
      <WorkspaceThemeSyncInner />
    </Suspense>
  );
}
