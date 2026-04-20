/** 출근 위치 표시용 — 모바일·태블릿 브라우저 여부 (휴리스틱) */
export function userAgentLooksMobile(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return /Mobile|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}
