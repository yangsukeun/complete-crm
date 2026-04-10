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
      if (isLogin) {
        if (!isLoggedIn) return true;
        const raw = request.nextUrl.searchParams.get("callbackUrl");
        if (
          typeof raw === "string" &&
          raw.startsWith("/") &&
          !raw.startsWith("//") &&
          !raw.includes("://")
        ) {
          return Response.redirect(new URL(raw, request.nextUrl));
        }
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }
      if (isSignup) return true; // 숨겨진 초기 관리자 가입용 (비로그인 허용)
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
