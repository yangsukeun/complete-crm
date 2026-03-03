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
      const isSignupPage = pathname === "/signup";
      const isDevLoginPage = pathname === "/dev-login";
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
      // 숨겨진 초기 관리자 가입 페이지: 비로그인 허용
      if (isSignupPage) return true;
      // 개발 전용 우회 로그인: 비로그인 허용
      if (isDevLoginPage) return true;
      // 보호 경로: 로그인하지 않았으면 로그인 페이지로 (false 시 signIn 페이지로 리다이렉트)
      if (isProtected && !isLoggedIn) {
        return false;
      }
      return true;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
