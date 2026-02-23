import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import { authConfig } from "@/auth.config";
import prisma from "@/lib/prisma";

const authSecret =
  process.env.NEXTAUTH_SECRET ??
  process.env.AUTH_SECRET ??
  (process.env.NODE_ENV === "development" ? "dev-secret-change-in-production" : undefined);

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
        if (!credentials?.email || !credentials?.password) return null;
        try {
          const user = await prisma.user.findUnique({
            where: { email: String(credentials.email).trim() },
            select: { id: true, email: true, name: true, image: true, password: true, role: true, permissions: true },
          });
          if (!user?.password) return null;
          const ok = await compare(String(credentials.password), user.password);
          if (!ok) return null;
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
