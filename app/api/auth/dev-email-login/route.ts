import { NextResponse } from "next/server";

/** 비활성: 로컬도 배포와 동일하게 /login 에서 이메일·비밀번호로 로그인하세요. */
export async function GET(req: Request) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  ) {
    return new Response(null, { status: 404 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}
