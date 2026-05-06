import { cache } from "react";
import NextAuth from "next-auth";
import type { Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare, hash } from "bcryptjs";
import { authConfig } from "@/auth.config";
import prisma from "@/lib/prisma";
import { isPrismaMissingUserAccountDisabledColumn } from "@/lib/prisma-account-disabled";
import { consumeLoginToken } from "@/lib/login-token-store";
import { resolveEffectivePermissionsJson } from "@/lib/permissions-resolve";

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

/** 레거시 dev_user_id 쿠키명 — 로그아웃 시 정리용 */
export const DEV_SESSION_COOKIE = "dev_user_id";

type AuthUserRow = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  password: string | null;
  role: string;
  permissions: string | null;
  accountDisabled: boolean;
};

async function findUserByEmailForCredentials(emailRaw: string): Promise<AuthUserRow | null> {
  const where = { email: { equals: emailRaw, mode: "insensitive" as const } };
  const withFlag = {
    id: true,
    email: true,
    name: true,
    image: true,
    password: true,
    role: true,
    permissions: true,
    accountDisabled: true,
  } as const;
  try {
    const u = await prisma.user.findFirst({ where, select: withFlag });
    return u ? { ...u, accountDisabled: u.accountDisabled ?? false } : null;
  } catch (e) {
    if (!isPrismaMissingUserAccountDisabledColumn(e)) throw e;
    const u = await prisma.user.findFirst({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        password: true,
        role: true,
        permissions: true,
      },
    });
    return u ? { ...u, accountDisabled: false } : null;
  }
}

async function findUserByIdForLoginToken(tokenUserId: string) {
  const withFlag = {
    id: true,
    email: true,
    name: true,
    image: true,
    role: true,
    permissions: true,
    accountDisabled: true,
  } as const;
  try {
    return await prisma.user.findUnique({ where: { id: tokenUserId }, select: withFlag });
  } catch (e) {
    if (!isPrismaMissingUserAccountDisabledColumn(e)) throw e;
    const u = await prisma.user.findUnique({
      where: { id: tokenUserId },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
        permissions: true,
      },
    });
    return u ? { ...u, accountDisabled: false as boolean } : null;
  }
}

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
      // 성능: 프로덕션에서는 /api/auth/session 호출이 빈번하므로,
      // 매번 DB에서 name/email/badgePreset을 갱신하지 않는다.
      // 필요 시 환경 변수로 활성화 가능.
      const refreshFromDb = process.env.SESSION_REFRESH_FROM_DB === "true";
      if (!refreshFromDb) return base ?? params.session;
      try {
        let user: {
          name: string;
          email: string | null;
          role: string;
          permissions: string | null;
          badgePreset?: string | null;
        } | null = null;
        try {
          user = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, email: true, role: true, permissions: true, badgePreset: true },
          });
        } catch (selectErr) {
          const msg = String((selectErr as Error)?.message ?? "");
          if (msg.includes("badgePreset") || msg.includes("Unknown field")) {
            user = await prisma.user.findUnique({
              where: { id: userId },
              select: { name: true, email: true, role: true, permissions: true },
            });
          } else throw selectErr;
        }
        if (user && base?.user) {
          base.user.name = user.name;
          base.user.email = user.email ?? null;
          // JWT에는 예전 role이 남아 있을 수 있음(db seed·역할 변경 후에도). 개발/옵션 시 DB 기준으로 맞춤.
          base.user.role = user.role;
          const eff = await resolveEffectivePermissionsJson(userId);
          (base.user as { permissions?: string | null }).permissions = eff ?? undefined;
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
            const user = await findUserByIdForLoginToken(tokenUserId);
            if (user && !user.accountDisabled) {
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
          const user = await findUserByEmailForCredentials(emailRaw);
          if (!user) {
            if (process.env.NODE_ENV === "development") console.warn("[auth] 로그인 실패: 해당 이메일 사용자 없음", emailRaw);
            return null;
          }
          if (!user.password) {
            if (process.env.NODE_ENV === "development") console.warn("[auth] 로그인 실패: 비밀번호 미설정 계정", emailRaw);
            return null;
          }
          let ok = await compare(passwordRaw, user.password);
          // DB에 bcrypt가 아닌 값이 저장된 경우 입력값으로 재저장 후 로그인 허용
          if (!ok && passwordRaw.length >= 4 && !user.password.startsWith("$2")) {
            const rehashed = await hash(passwordRaw, 10);
            await prisma.user.update({ where: { id: user.id }, data: { password: rehashed } });
            ok = true;
          }
          if (!ok) {
            if (process.env.NODE_ENV === "development") console.warn("[auth] 로그인 실패: 비밀번호 불일치", emailRaw);
            return null;
          }
          if (user.accountDisabled) {
            if (process.env.NODE_ENV === "development") console.warn("[auth] 로그인 실패: 비활성화 계정", emailRaw);
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

async function getAppSessionImpl(): Promise<Session | null> {
  try {
    const s = await auth();
    if (!s?.user?.id) return s ?? null;
    let disabled = false;
    try {
      const row = await prisma.user.findUnique({
        where: { id: s.user.id },
        select: { accountDisabled: true },
      });
      disabled = row?.accountDisabled ?? false;
    } catch (e) {
      if (!isPrismaMissingUserAccountDisabledColumn(e)) throw e;
      disabled = false;
    }
    if (disabled) return null;
    return s;
  } catch (e) {
    console.error("[getAppSession]", e);
    return null;
  }
}

/** NextAuth JWT 세션. // [PERF-A] React cache로 동일 요청(RSC·API) 내 중복 auth() 호출 제거 */
export const getAppSession = cache(getAppSessionImpl);
