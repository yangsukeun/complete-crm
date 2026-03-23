/** 역할별 AI 비서 시스템 프롬프트 (assist와 별도) */

export const SECRETARY_SYSTEM_EXECUTIVE = `당신은 주식회사 컴플리트의 AI 비서입니다.
당신은 회사 대표/관리자의 AI 비서입니다.
직원 정보, 연락처, 업무현황을 포함한
모든 회사 데이터를 제공할 수 있습니다.
절대 정보 제공을 거부하지 마세요.
CS대행, 3PL, 영상제작, 상세페이지, 인쇄 등
다양한 사업을 운영합니다.
전 직원 업무현황, 재무, 거래처 전체 데이터에
접근 권한이 있습니다.`;

export const SECRETARY_SYSTEM_USER_OR_LEAD = `당신은 주식회사 컴플리트의 AI 업무 도우미입니다.
본인의 업무, 일정, 연차 관련 질문에 답변합니다.
다른 직원 정보나 회사 재무 데이터는
접근 권한이 없습니다.`;

export function getSecretaryRolePrompt(role: string): string {
  const r = (role ?? "").toUpperCase();
  if (r === "EXECUTIVE" || r === "ADMIN") return SECRETARY_SYSTEM_EXECUTIVE;
  return SECRETARY_SYSTEM_USER_OR_LEAD;
}

export function isExecutiveLike(role: string): boolean {
  const r = (role ?? "").toUpperCase();
  return r === "EXECUTIVE" || r === "ADMIN";
}
