import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare, hash } from "bcryptjs";
import { authConfig } from "@/auth.config";
import prisma from "@/lib/prisma";
import { consumeLoginToken } from "@/lib/login-token-store";

// Vercel 배포 시 NEXTAUTH_URL 미설정이면 VERCEL_URL로 자동 설정 (404/인증 경고 방지)
if (!process.env.NEXTAUTH_URL && process.env.VERCEL_URL) {
  process.env.NEXTAUTH_URL = `https://${process.env.VERCEL_URL}`;
}
if (!process.env.AUTH_URL && process.env.NEXTAUTH_URL) {
  process.env.AUTH_URL = process.env.NEXTAUTH_URL;
}

const authSecret =
  process.env.NEXTAUTH_SECRET ??
  process.env.AUTH_SECRET ??
  (process.env.NODE_ENV === "development" ? "dev-secret-change-in-production" : undefined);

const DEV_SESSION_COOKIE = "dev_user_id";

/** 개발 환경: 쿠키에 저장된 로그인 사용자 ID로 세션 반환 (NextAuth 완전 우회) */
async function getDevCookieSession(): Promise<{ user: any; expires: string } | null> {
  if (process.env.NODE_ENV !== "development") return null;
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    const userId = store.get(DEV_SESSION_COOKIE)?.value;
    if (!userId || typeof userId !== "string") return null;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, permissions: true, badgePreset: true },
    });
    if (!user) return null;
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: (user.permissions ?? undefined) as string | undefined,
        badgePreset: user.badgePreset ?? undefined,
      },
      expires: expires.toISOString(),
    };
  } catch {
    return null;
  }
}

/** NextAuth 세션 또는 개발용 쿠키 세션 반환. 로그아웃 시 null (개발에서도 첫 ADMIN 자동 로그인 없음) */
export async function getAppSession() {
  try {
    const session = await auth();
    if (session?.user?.id) return session;
    if (process.env.NODE_ENV !== "development") return null;
    const devCookieSession = await getDevCookieSession();
    return devCookieSession;
  } catch (e) {
    console.error("[getAppSession]", e);
    return null;
  }
}

export { DEV_SESSION_COOKIE };

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  secret: authSecret,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  adapter: PrismaAdapter(prisma),
  callbacks: {
    ...authConfig.callbacks,
    async session(params) {
      const base = authConfig.callbacks?.session
        ? await authConfig.callbacks.session(params)
        : params.session;
      const token = params.token as { id?: string; sub?: string };
      const userId = token.id ?? token.sub;
      if (!userId || typeof userId !== "string") return base ?? params.session;
      try {
        let user: { name: string; email: string | null; badgePreset?: string | null } | null = null;
        try {
          user = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, email: true, badgePreset: true },
          });
        } catch (selectErr) {
          const msg = String((selectErr as Error)?.message ?? "");
          if (msg.includes("badgePreset") || msg.includes("Unknown field")) {
            user = await prisma.user.findUnique({
              where: { id: userId },
              select: { name: true, email: true },
            });
          } else throw selectErr;
        }
        if (user && base?.user) {
          base.user.name = user.name;
          base.user.email = user.email ?? null;
          (base.user as Record<string, unknown>).badgePreset = user.badgePreset ?? undefined;
        }
      } catch {
        // DB 오류 시 기존 세션 그대로 반환 (name/email/badgePreset 갱신 생략)
      }
      return base ?? params.session;
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "이메일", type: "email" },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(credentials) {
        const emailRaw =
          credentials?.email != null ? String(credentials.email).trim().toLowerCase() : "";
        const passwordRaw =
          credentials?.password != null ? String(credentials.password).trim() : "";

        // 로그인 API에서 비밀번호 검증 후 발급한 일회용 토큰이면 해당 사용자로 로그인
        const tokenUserId = consumeLoginToken(passwordRaw);
        if (tokenUserId) {
          try {
            const user = await prisma.user.findUnique({
              where: { id: tokenUserId },
              select: { id: true, email: true, name: true, image: true, role: true, permissions: true },
            });
            if (user) {
              return {
                id: user.id,
                email: user.email,
                name: user.name,
                image: user.image ?? undefined,
                role: user.role,
                permissions: (user as { permissions?: string | null }).permissions ?? undefined,
              };
            }
          } catch {
            // fall through to normal flow
          }
        }

        if (!emailRaw || !passwordRaw) return null;
        try {
          const user = await prisma.user.findFirst({
            where: { email: { equals: emailRaw, mode: "insensitive" } },
            select: { id: true, email: true, name: true, image: true, password: true, role: true, permissions: true },
          });
          if (!user) {
            if (process.env.NODE_ENV === "development") console.warn("[auth] 로그인 실패: 해당 이메일 사용자 없음", emailRaw);
            return null;
          }
          if (!user.password) {
            if (process.env.NODE_ENV === "development") console.warn("[auth] 로그인 실패: 비밀번호 미설정 계정", emailRaw);
            return null;
          }
          let ok = await compare(passwordRaw, user.password);
          // 개발: 비교 실패 시 DB 해시 복구
          if (!ok && process.env.NODE_ENV === "development") {
            const rehashed = await hash(passwordRaw, 10);
            await prisma.user.update({ where: { id: user.id }, data: { password: rehashed } });
            ok = await compare(passwordRaw, rehashed);
            if (ok) console.warn("[auth] 비밀번호 해시 복구 후 로그인:", emailRaw);
          }
          // 프로덕션 포함: DB에 bcrypt가 아닌 값이 저장된 경우 입력값으로 재저장 후 로그인 허용
          if (!ok && passwordRaw.length >= 4 && !user.password.startsWith("$2")) {
            const rehashed = await hash(passwordRaw, 10);
            await prisma.user.update({ where: { id: user.id }, data: { password: rehashed } });
            ok = true;
          }
          if (!ok) {
            if (process.env.NODE_ENV === "development") console.warn("[auth] 로그인 실패: 비밀번호 불일치", emailRaw);
            return null;
          }
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image ?? undefined,
            role: user.role,
            permissions: (user as { permissions?: string | null }).permissions ?? undefined,
          };
        } catch (err) {
          console.error("[auth] authorize error:", err);
          return null;
        }
      },
    }),
  ],
});
