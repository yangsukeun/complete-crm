import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { signIn } from "@/auth";
import { crmCallbackPath, startsCompanyMode } from "@/lib/crm-login-landing";
import { setCompanyModeCookie } from "@/lib/crm-login-mode";
import prisma from "@/lib/prisma";
import { verifyLoginPassword } from "@/lib/verify-login-password";
import { createLoginToken } from "@/lib/login-token-store";


/**
 * 이메일/비밀번호 검증 후 NextAuth signIn으로 세션 생성.
 * (로컬·배포 동일: 반드시 비밀번호 검증)
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
    const callbackUrl = crmCallbackPath(body.callbackUrl);
    const signInError = () => {
      const url = new URL("/login", req.url);
      url.searchParams.set("error", "CredentialsSignin");
      if (callbackUrl !== "/") url.searchParams.set("callbackUrl", callbackUrl);
      return NextResponse.redirect(url, 303);
    };

    if (!email) {
      if (isForm) {
        return signInError();
      }
      return NextResponse.json({ error: "이메일을 입력하세요." }, { status: 400 });
    }
    if (!password) {
      if (isForm) {
        return signInError();
      }
      return NextResponse.json({ error: "비밀번호를 입력하세요." }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, email: true, name: true, password: true },
    });

    if (!user) {
      if (isForm) {
        return signInError();
      }
      return NextResponse.json({ error: "로그인에 실패했습니다." }, { status: 401 });
    }

    const ok = await verifyLoginPassword(password, user.password);

    if (!ok) {
      if (isForm) {
        return signInError();
      }
      return NextResponse.json({ error: "로그인에 실패했습니다." }, { status: 401 });
    }

    const loginToken = createLoginToken(user.id);
    try {
      const destination = await signIn("credentials", {
        email: user.email,
        password: loginToken,
        redirectTo: callbackUrl,
        redirect: false,
      });
      if (typeof destination !== "string") throw new Error("Missing login redirect");
      const landing = new URL(callbackUrl, req.url);
      // A successful work login initializes the existing UI mode cookie, not account permissions.
      // Keep explicit personal deep links in their existing mode.
      if (startsCompanyMode(callbackUrl)) setCompanyModeCookie(await cookies(), landing.protocol === "https:");
      if (isForm) return NextResponse.redirect(landing, 303);
    } catch (err: unknown) {
      if (err instanceof Response) return err;
      console.error("[auth/login] signIn throw", err);
      if (isForm) {
        return signInError();
      }
      throw err;
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[auth/login]", e);
    return NextResponse.json(
      { error: "로그인 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
