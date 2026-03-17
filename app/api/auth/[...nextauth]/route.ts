import { NextResponse } from "next/server";
import { handlers, getAppSession } from "@/auth";

const { GET: AuthGET, POST: AuthPOST } = handlers;

type RouteContext = { params: Promise<{ nextauth: string[] }> };

async function handleGet(req: Request, context: RouteContext) {
  try {
    const params = await context.params;
    // /api/auth/session: getAppSession으로 세션 조회. 실패 시에도 200 + 빈 객체 반환해 앱이 깨지지 않게 함
    if (params?.nextauth?.[0] === "session") {
      try {
        const session = await getAppSession();
        const body = session ?? {};
        return new NextResponse(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (sessionErr) {
        console.error("[auth] session error:", sessionErr);
        return new NextResponse(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
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
