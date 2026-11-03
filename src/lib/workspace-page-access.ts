import { workspaceAreas, type WorkspaceArea } from "./workspace-areas";

/** Navigation/home access only. Never use this to authorize sales, HR or files. */
export function workspacePageAreas(user: { id: string; department?: string | null; accountDisabled?: boolean }): WorkspaceArea[] {
  if (user.accountDisabled) return [];
  const existing = workspaceAreas(user);
  const department = (user.department ?? "").replace(/\s+/g, "");
  if (department === "경영지원" || department === "경영지원팀") {
    return [...new Set<WorkspaceArea>([...existing, "cs", "logistics"])];
  }
  return existing;
}

export function workspaceHomeHref(area: WorkspaceArea): string {
  if (area === "cs") return "/cs-tools";
  if (area === "logistics") return "/logistics";
  return `/workspaces/${area}`;
}
