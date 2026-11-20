import { WORKSPACE_OWNER, workspaceAreas, type WorkspaceArea } from "./workspace-areas";
import { workspaceHomeHref } from "./workspace-page-access";

export const CRM_HOME = "/";
export const RUA_CONVERSATION = "/rua-project";
export const REPRESENTATIVE_HOME = "/representative";

export function isRepresentative(userId: string | null | undefined) {
  return userId === WORKSPACE_OWNER;
}

export function isWorkspaceArea(value: string): value is WorkspaceArea {
  return value === "management" || value === "marketing" || value === "cs" || value === "logistics";
}

/** Do not use supplementary workspace access to choose a user's own department. */
export function crmLandingForUser(user: { id: string; department?: string | null }): string {
  if (isRepresentative(user.id)) return RUA_CONVERSATION;
  const [area] = workspaceAreas(user);
  return area ? workspaceHomeHref(area) : "/workspaces";
}

/** Department routes use work menus even if personal mode was remembered on another visit. */
export function isCompanyLandingPath(pathname: string) {
  return ["/workspaces", "/cs-tools", "/logistics", RUA_CONVERSATION, REPRESENTATIVE_HOME]
    .some((path) => pathname === path || pathname.startsWith(path + "/"));
}

export function crmCallbackPath(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || /[\\\s\x00-\x1f\x7f]/u.test(raw)) return CRM_HOME;
  try {
    const dest = new URL(raw, "https://crm.invalid");
    if (dest.origin !== "https://crm.invalid") return CRM_HOME;
    const path = decodeURIComponent(dest.pathname).replace(/\/+$/, "");
    if (/^(?:\/login|\/signup|\/api)(?:\/|$)/i.test(path)) return CRM_HOME;
    if (path === "/dashboard" || path === "/choose-mode") return CRM_HOME;
    return dest.pathname + dest.search + dest.hash;
  } catch {
    return CRM_HOME;
  }
}

export function startsCompanyMode(callbackPath: string) {
  const path = callbackPath.split(/[?#]/, 1)[0];
  return !["/personal", "/my-project"].some((prefix) => path === prefix || path.startsWith(prefix + "/"));
}
