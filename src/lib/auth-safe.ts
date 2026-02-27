import { auth } from "@/auth";

const AUTH_TIMEOUT_MS = 10000;

/**
 * auth()가 DB 등으로 인해 응답하지 않을 때를 대비해 타임아웃 적용.
 * 지연 시 null을 반환해 화면이 계속 로딩만 되는 현상을 방지합니다.
 * JWTSessionError 등 세션 오류 시에도 null을 반환해 레이아웃이 깨지지 않도록 합니다.
 */
export async function authWithTimeout(): Promise<any> {
  try {
    return await Promise.race<any>([
      auth() as any,
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
