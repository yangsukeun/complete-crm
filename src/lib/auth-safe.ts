import { getAppSession } from "@/auth";

const AUTH_TIMEOUT_MS = 10000;

/**
 * getAppSession() 사용. 개발 환경에서는 비로그인 시 첫 ADMIN 세션으로 동작.
 * auth()가 DB 등으로 인해 응답하지 않을 때를 대비해 타임아웃 적용.
 */
export async function authWithTimeout(): Promise<any> {
  try {
    return await Promise.race<any>([
      getAppSession() as any,
      new Promise<any>((_, reject) =>
        setTimeout(() => reject(new Error("auth_timeout")), AUTH_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    if (process.env.NODE_ENV === "development" && err instanceof Error) {
      console.warn("[auth-safe] 세션 조회 실패, 비로그인으로 처리:", err.message);
    }
    return null;
  }
}
