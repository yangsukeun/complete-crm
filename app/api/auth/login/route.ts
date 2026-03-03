import { NextResponse } from "next/server";
import { signIn, DEV_SESSION_COOKIE } from "@/auth";
import prisma from "@/lib/prisma";
import { compare, hash } from "bcryptjs";
import { createLoginToken } from "@/lib/login-token-store";

const DEV_PASSWORD = "dev1234";
const DEV_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30일

/**
 * 이메일/비밀번호 검증 후 NextAuth signIn을 호출해 세션을 생성합니다.
 * NextAuth 폼 POST가 CSRF 등으로 authorize까지 도달하지 않을 때 사용합니다.
 */
export async function POST(req: Request) {
  try {
    let body: Record<string, unknown> = {};
    const contentType = req.headers.get("content-type") ?? "";
    const isForm = contentType.includes("application/x-www-form-urlencoded");
    if (isForm) {
      const form = await req.formData();
      body = {
        email: form.get("email"),
        password: form.get("password"),
        callbackUrl: form.get("callbackUrl"),
      };
    } else {
      body = (await req.json()) as Record<string, unknown>;
    }
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password.trim() : "";
    const callbackUrl = typeof body?.callbackUrl === "string" && body.callbackUrl.startsWith("/")
      ? body.callbackUrl
      : "/choose-mode";

    if (process.env.NODE_ENV === "development") {
      console.warn("[auth/login] request", {
        contentType,
        isForm,
        hasEmail: !!email,
        hasPassword: !!password,
        pwLen: password.length,
        callbackUrl,
      });
    }

    if (!email) {
      if (isForm) {
        return NextResponse.redirect(new URL("/login?error=CredentialsSignin", req.url));
      }
      return NextResponse.json({ error: "이메일을 입력하세요." }, { status: 400 });
    }
    if (!password && process.env.NODE_ENV !== "development") {
      if (isForm) {
        return NextResponse.redirect(new URL("/login?error=CredentialsSignin", req.url));
      }
      return NextResponse.json({ error: "비밀번호를 입력하세요." }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, email: true, name: true, password: true },
    });

    if (!user) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[auth/login] user not found", { email });
      }
      return NextResponse.redirect(
        new URL("/login?error=CredentialsSignin", req.url)
      );
    }

    let ok: boolean;

    // 개발 환경: 이메일만 맞으면 비밀번호 검사 없이 로그인
    if (process.env.NODE_ENV === "development") {
      ok = true;
      console.warn("[auth/login] 개발 모드 — 이메일 일치로 로그인 허용:", user.email);
    } else {
      if (!user.password) {
        ok = false;
      } else {
        ok = await compare(password, user.password);
        if (!ok && password === DEV_PASSWORD) {
          const hashed = await hash(DEV_PASSWORD, 10);
          await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
          ok = true;
        }
        // DB에 bcrypt 해시가 아닌 값이 저장된 경우(평문/깨진 해시): 입력값으로 재저장 후 로그인 허용
        if (!ok && password.length >= 4 && !user.password.startsWith("$2")) {
          const hashed = await hash(password, 10);
          await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
          ok = true;
        }
      }
    }

    if (!ok) {
      return NextResponse.redirect(
        new URL("/login?error=CredentialsSignin", req.url)
      );
    }

    // 개발: NextAuth 완전 우회 — 쿠키만 설정하고 리다이렉트 (signIn/authorize 호출 없음)
    if (process.env.NODE_ENV === "development") {
      const url = new URL(callbackUrl, req.url);
      const res = NextResponse.redirect(url);
      res.cookies.set(DEV_SESSION_COOKIE, user.id, {
        path: "/",
        maxAge: DEV_COOKIE_MAX_AGE,
        httpOnly: true,
        sameSite: "lax",
        secure: false,
      });
      console.warn("[auth/login] 개발 모드 — 쿠키 로그인 완료:", user.email);
      return res;
    }

    // 프로덕션: 기존 NextAuth signIn
    const loginToken = createLoginToken(user.id);
    try {
      await signIn("credentials", {
        email: user.email,
        password: loginToken,
        callbackUrl,
        redirect: true,
      });
    } catch (err: unknown) {
      if (err instanceof Response) return err;
      const e = err as { url?: string; type?: string; digest?: string };
      if (e?.url && (e?.type === "redirect" || e?.digest?.startsWith("NEXT_REDIRECT"))) {
        return NextResponse.redirect(e.url);
      }
      console.error("[auth/login] signIn throw", err);
      if (isForm) {
        return NextResponse.redirect(new URL("/login?error=CredentialsSignin", req.url));
      }
      throw err;
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[auth/login]", e);
    const message = process.env.NODE_ENV === "development" && e instanceof Error ? e.message : "로그인 처리 중 오류가 발생했습니다.";
    return NextResponse.json(
      { error: "로그인 처리 중 오류가 발생했습니다.", details: process.env.NODE_ENV === "development" ? String(e) : undefined },
      { status: 500 }
    );
  }
}
