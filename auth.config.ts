import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const pathname = request.nextUrl.pathname;
      const isLoginPage = pathname === "/login";
      const isProtected =
        pathname === "/" ||
        pathname.startsWith("/company") ||
        pathname.startsWith("/personal") ||
        pathname.startsWith("/hr") ||
        pathname.startsWith("/documents");

      // 로그인한 상태에서 /login 접근 시 메인으로
      if (isLoginPage && isLoggedIn) {
        return Response.redirect(new URL("/", request.nextUrl));
      }
      // 보호 경로: 로그인하지 않았으면 로그인 페이지로 (false 시 signIn 페이지로 리다이렉트)
      if (isProtected && !isLoggedIn) {
        return false;
      }
      return true;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
