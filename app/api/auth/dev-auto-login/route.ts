import { NextResponse } from "next/server";
import { DEV_SESSION_COOKIE } from "@/auth";
import prisma from "@/lib/prisma";

const DEV_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30일

/**
 * 개발 전용: 로그인 폼 없이 첫 번째 사용자로 자동 로그인
 * /login 에서 리다이렉트하거나, 직접 주소창에 /api/auth/dev-auto-login 입력
 */
export async function GET(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const first = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!first) {
    return NextResponse.redirect(
      new URL("/login?error=DB에 사용자가 없습니다. /signup 으로 먼저 가입하세요.", req.url)
    );
  }
  const callbackUrl = new URL(req.url).searchParams.get("callbackUrl")?.startsWith("/")
    ? new URL(req.url).searchParams.get("callbackUrl")!
    : "/choose-mode";
  const url = new URL(callbackUrl, req.url);
  const res = NextResponse.redirect(url);
  res.cookies.set(DEV_SESSION_COOKIE, first.id, {
    path: "/",
    maxAge: DEV_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
    secure: false,
  });
  console.warn("[dev-auto-login] 자동 로그인:", first.email);
  return res;
}
