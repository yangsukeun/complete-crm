import { cookies } from "next/headers";
import { getAppSession } from "@/auth";
import { resolveAppModeForUser } from "@/lib/app-mode-server";

export type WorkspaceScope = "TEAM" | "PERSONAL";

/**
 * 쿠키 app_mode + User.lastAppMode 복구 기준 워크스페이스 스코프
 */
export async function getServerWorkspaceScope(): Promise<WorkspaceScope> {
  const cookieStore = await cookies();
  const session = await getAppSession();
  let effective: "company" | "personal" | null = null;
  if (session?.user?.id) {
    effective = await resolveAppModeForUser(session.user.id, cookieStore);
  }
  if (effective == null) {
    const raw = cookieStore.get("app_mode")?.value;
    if (raw === "company" || raw === "personal") effective = raw;
  }
  return effective === "personal" ? "PERSONAL" : "TEAM";
}

/**
 * 요청의 x-workspace 헤더가 있으면 우선 사용 (즉시 전환용).
 * 없으면 쿠키 기준으로 반환.
 */
export async function getServerWorkspaceScopeFromRequest(req: Request): Promise<WorkspaceScope> {
  const header = req.headers.get("x-workspace");
  if (header === "MY") return "PERSONAL";
  if (header === "TEAM") return "TEAM";
  return getServerWorkspaceScope();
}

export function isPersonalScope(scope: WorkspaceScope): boolean {
  return scope === "PERSONAL";
}
