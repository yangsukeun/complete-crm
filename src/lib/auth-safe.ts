import { getAppSession } from "@/auth";

const AUTH_TIMEOUT_MS = 10000;

/**
 * getAppSession() (= NextAuth 세션). 응답 지연 시 타임아웃.
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
