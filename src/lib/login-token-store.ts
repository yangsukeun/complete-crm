/**
 * 로그인 API에서 비밀번호 검증 후 signIn() 호출 시,
 * authorize()에 비밀번호가 전달되지 않는 경우를 대비한 일회용 토큰.
 * 토큰을 password 자리에 넘기면 authorize()에서 사용자로 인식해 세션 생성.
 */

const store = new Map<string, { userId: string; expires: number }>();
const TTL_MS = 60 * 1000; // 1분
const TOKEN_PREFIX = "login_";

export function createLoginToken(userId: string): string {
  const token = TOKEN_PREFIX + Math.random().toString(36).slice(2) + Date.now().toString(36);
  store.set(token, { userId, expires: Date.now() + TTL_MS });
  return token;
}

export function consumeLoginToken(password: string): string | null {
  if (typeof password !== "string" || !password.startsWith(TOKEN_PREFIX) || password.length > 200) {
    return null;
  }
  const entry = store.get(password);
  if (!entry || entry.expires < Date.now()) {
    if (entry) store.delete(password);
    return null;
  }
  store.delete(password);
  return entry.userId;
}
