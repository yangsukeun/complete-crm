import type { NextAuthConfig } from "next-auth";
import { resolveEffectivePermissionsJson } from "@/lib/permissions-resolve";
import { crmCallbackPath } from "@/lib/crm-login-landing";

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
        if (request.nextUrl.searchParams.get("error") === "AccountUnavailable") return true;
        const dest = crmCallbackPath(request.nextUrl.searchParams.get("callbackUrl"));
        return Response.redirect(new URL(dest, request.nextUrl));
      }
      if (isSignup) return true; // 숨겨진 초기 관리자 가입용 (비로그인 허용)
      return isLoggedIn ? true : false;
    },
    signIn() {
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
        token.department = (user as { department?: string | null }).department ?? "";
        token.position = (user as { position?: string | null }).position ?? "";
        token.permissions = await resolveEffectivePermissionsJson(user.id);
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.department = (token.department as string | null | undefined) ?? null;
        session.user.position = (token.position as string | null | undefined) ?? null;
        (session.user as { permissions?: string | null }).permissions = (token.permissions as string | null) ?? undefined;
      }
      return session;
    },
  },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  providers: [],
};
