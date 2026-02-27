import type { NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge에서 실행되므로 auth.config.ts만 사용 (Prisma/bcrypt 미사용)
const { auth } = NextAuth(authConfig as any) as any;

export function proxy(request: NextRequest) {
  return (auth as any)(request);
}

export const config = {
  // 보호할 경로만 명시해 /api/auth/* 등 API 요청은 절대 가로채지 않음 (ClientFetchError 방지)
  matcher: [
    "/",
    "/dashboard",
    "/dashboard/:path*",
    "/schedule/:path*",
    "/tasks/:path*",
    "/profile/:path*",
    "/leave/:path*",
    "/chat/:path*",
    "/company/:path*",
    "/personal/:path*",
    "/hr/:path*",
    "/documents/:path*",
    "/choose-mode",
    "/admin/:path*",
  ],
};
