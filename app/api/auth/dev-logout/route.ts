import { NextResponse } from "next/server";
import { DEV_SESSION_COOKIE } from "@/auth";

/**
 * 레거시 dev_user_id 쿠키 정리 후 로그인으로 이동.
 * 완전한 로그아웃은 UI에서 signOut()을 사용하세요.
 */
export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.set(DEV_SESSION_COOKIE, "", { path: "/", maxAge: 0, expires: new Date(0) });
  return res;
}
