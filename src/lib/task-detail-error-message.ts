/** 과제 상세 API 응답 → 사용자용 문구 */
export async function taskDetailErrorMessage(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string; message?: string };
    if (typeof j.message === "string" && j.message.trim()) return j.message.trim();
    if (j.error === "workspace_mismatch") {
      return "팀/개인 모드가 이 프로젝트와 맞지 않습니다. 상단에서 모드를 전환한 뒤 다시 시도해 주세요.";
    }
    if (typeof j.error === "string" && j.error.length > 0 && j.error !== "not_found") {
      return j.error;
    }
  } catch {
    /* ignore */
  }
  if (res.status === 404) return "존재하지 않거나 삭제된 프로젝트입니다.";
  if (res.status === 403) return "이 프로젝트에 접근할 권한이 없거나, 모드가 맞지 않습니다.";
  if (res.status === 401) return "로그인이 필요합니다.";
  return "프로젝트를 불러올 수 없습니다.";
}
