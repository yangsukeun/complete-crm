import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { DEV_SESSION_COOKIE } from "@/auth";
import prisma from "@/lib/prisma";

const DEV_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30일

/**
 * 개발 전용: 이메일만으로 로그인. 계정 없으면 자동 생성 후 내정보(/profile)로 이동
 */
export async function GET(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email")?.trim().toLowerCase() ?? "";
  const callbackUrlParam = searchParams.get("callbackUrl")?.startsWith("/") ? searchParams.get("callbackUrl")! : "/choose-mode";

  if (!email) {
    return NextResponse.redirect(new URL("/login?error=이메일을 입력하세요", req.url));
  }

  let user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, name: true },
  });

  let isNewUser = false;
  if (!user) {
    const localPart = email.split("@")[0] || "사용자";
    const hashedPassword = await hash("dev-no-password", 10);
    const created = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: localPart,
        role: "USER",
      },
      select: { id: true, email: true, name: true },
    });
    user = created;
    isNewUser = true;
    console.warn("[dev-email-login] 신규 계정 생성:", user.email);
  } else {
    console.warn("[dev-email-login] 로그인 완료:", user.email);
  }

  const destination = isNewUser ? "/profile?new=1" : callbackUrlParam;
  const url = new URL(destination, req.url);
  const res = NextResponse.redirect(url);
  res.cookies.set(DEV_SESSION_COOKIE, user.id, {
    path: "/",
    maxAge: DEV_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
    secure: false,
  });
  return res;
}
