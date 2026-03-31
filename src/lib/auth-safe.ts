import { cache } from "react";
import { getAppSession } from "@/auth";

const AUTH_TIMEOUT_MS = 10000;

/**
 * getAppSession() (= NextAuth 세션). 응답 지연 시 타임아웃.
 * React cache: 동일 요청 내 layout·page 등 중복 호출을 한 번으로 합침.
 */
async function authWithTimeoutImpl(): Promise<any> {
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

export const authWithTimeout = cache(authWithTimeoutImpl);
