import { NextResponse } from "next/server";
import { handlers, getAppSession } from "@/auth";

const { GET: AuthGET, POST: AuthPOST } = handlers;

type RouteContext = { params: Promise<{ nextauth: string[] }> };

async function handleGet(req: Request, context: RouteContext) {
  try {
    const params = await context.params;
    // 개발 환경: /api/auth/session 요청 시 getAppSession 사용 → dev 쿠키 세션도 200 반환 (클라이언트 401 방지)
    if (process.env.NODE_ENV === "development" && params?.nextauth?.[0] === "session") {
      const session = await getAppSession();
      if (session) {
        return NextResponse.json(session);
      }
    }
    return await (AuthGET as any)(req);
  } catch (e) {
    console.error("[auth] GET error:", e);
    return NextResponse.json(
      { error: "SessionError", message: "세션을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

async function handlePost(req: Request, context: RouteContext) {
  try {
    const params = await context.params;
    if (process.env.NODE_ENV === "development") {
      const u = req.url ?? "";
      console.warn("[auth] POST", u);
    }
    return await (AuthPOST as any)(req);
  } catch (e) {
    console.error("[auth] POST error:", e);
    return NextResponse.json(
      { error: "AuthError", message: "인증 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export const GET = handleGet;
export const POST = handlePost;
