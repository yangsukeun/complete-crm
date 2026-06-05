/**
 * 마스터(최고 관리자) 계정 식별.
 *
 * 마스터는 role과 무관하게 **이메일**로 식별합니다(기본값 admin@complete.co.kr).
 * 감사용 화면(직원 대화목록 열람, 휴지통/삭제이력, 삭제된 프로젝트 등)은 마스터 전용으로 제한하고,
 * 대표(EXECUTIVE)·일반 관리자(ADMIN)는 일반 직원처럼 본인 데이터만 보도록 합니다.
 *
 * 클라이언트에서도 동일 판정이 필요하면 NEXT_PUBLIC_MASTER_EMAIL을 함께 설정하세요.
 * (둘 다 미설정 시 기본값으로 서버/클라이언트가 일치합니다.)
 */
export const DEFAULT_MASTER_EMAIL = "admin@complete.co.kr";

export function getMasterEmail(): string {
  const raw =
    process.env.MASTER_EMAIL ??
    process.env.NEXT_PUBLIC_MASTER_EMAIL ??
    DEFAULT_MASTER_EMAIL;
  return raw.trim().toLowerCase();
}

export function isMasterEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === getMasterEmail();
}

/** 세션 객체로 마스터 여부 판정 */
export function isMasterSession(
  session: { user?: { email?: string | null } | null } | null | undefined
): boolean {
  return isMasterEmail(session?.user?.email ?? null);
}
