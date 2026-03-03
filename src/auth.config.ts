import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  trustHost: true,
  basePath: "/api/auth",
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const path = request.nextUrl.pathname;
      const isLogin = path.startsWith("/login");
      const isSignup = path.startsWith("/signup");
      const isDevLogin = path.startsWith("/dev-login");
      if (isLogin) return isLoggedIn ? Response.redirect(new URL("/dashboard", request.nextUrl)) : true;
      if (isSignup) return true; // 숨겨진 초기 관리자 가입용 (비로그인 허용)
      if (isDevLogin) return true; // 개발 전용 우회 로그인
      // 개발 환경: 로그인 없이 접속 허용 → 레이아웃에서 getAppSession으로 첫 ADMIN 세션 사용
      if (!isLoggedIn && process.env.NODE_ENV === "development") return true;
      return isLoggedIn ? true : false;
    },
    signIn() {
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
        token.permissions = (user as { permissions?: string | null }).permissions ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        (session.user as { permissions?: string | null }).permissions = (token.permissions as string | null) ?? undefined;
      }
      return session;
    },
  },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  providers: [],
};
