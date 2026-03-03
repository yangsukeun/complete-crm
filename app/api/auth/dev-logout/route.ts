import { NextResponse } from "next/server";
import { DEV_SESSION_COOKIE } from "@/auth";

/**
 * 개발 환경 전용: dev_user_id 쿠키 삭제 후 로그인 페이지로 리다이렉트
 */
export async function GET(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.set(DEV_SESSION_COOKIE, "", { path: "/", maxAge: 0, expires: new Date(0) });
  return res;
}
