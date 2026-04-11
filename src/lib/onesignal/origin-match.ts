/**
 * OneSignal 대시보드 Site URL 과 브라우저 origin 비교 시
 * `www` 유무·호스트 대소문자 차이로 init 이 스킵되거나 SDK만 거절되는 경우를 줄입니다.
 */
export function stripWwwHostname(host: string): string {
  const h = host.trim().toLowerCase();
  return h.startsWith("www.") ? h.slice(4) : h;
}

/** 동일 사이트로 볼 수 있는지 (프로토콜 + apex 호스트 일치) */
export function originsEquivalentForSiteUrl(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    if (ua.protocol !== ub.protocol) return false;
    return stripWwwHostname(ua.hostname) === stripWwwHostname(ub.hostname);
  } catch {
    return false;
  }
}
