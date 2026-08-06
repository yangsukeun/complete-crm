import { NextResponse } from "next/server";

/** 비활성: 자동 로그인은 지원하지 않습니다. */
export async function GET(req: Request) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  ) {
    return new Response(null, { status: 404 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}
