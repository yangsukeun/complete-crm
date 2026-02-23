import { cookies } from "next/headers";

export type WorkspaceScope = "TEAM" | "PERSONAL";

/**
 * 서버에서 쿠키(app_mode) 기준 현재 워크스페이스 스코프 반환
 */
export async function getServerWorkspaceScope(): Promise<WorkspaceScope> {
  const cookieStore = await cookies();
  const mode = cookieStore.get("app_mode")?.value;
  return mode === "personal" ? "PERSONAL" : "TEAM";
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
