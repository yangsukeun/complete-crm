import { NextResponse } from "next/server";
import { signIn } from "@/auth";
import prisma from "@/lib/prisma";
import { compare, hash } from "bcryptjs";
import { createLoginToken } from "@/lib/login-token-store";

const DEV_PASSWORD = "dev1234";

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
    const callbackUrl = typeof body?.callbackUrl === "string" && body.callbackUrl.startsWith("/")
      ? body.callbackUrl
      : "/choose-mode";

    if (!email) {
      if (isForm) {
        return NextResponse.redirect(new URL("/login?error=CredentialsSignin", req.url));
      }
      return NextResponse.json({ error: "이메일을 입력하세요." }, { status: 400 });
    }
    if (!password) {
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
      if (isForm) {
        return NextResponse.redirect(new URL("/login?error=CredentialsSignin", req.url));
      }
      return NextResponse.json({ error: "로그인에 실패했습니다." }, { status: 401 });
    }

    let ok = false;
    if (!user.password) {
      ok = false;
    } else {
      ok = await compare(password, user.password);
      if (!ok && password === DEV_PASSWORD) {
        const hashed = await hash(DEV_PASSWORD, 10);
        await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
        ok = true;
      }
      if (!ok && password.length >= 4 && !user.password.startsWith("$2")) {
        const hashed = await hash(password, 10);
        await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
        ok = true;
      }
    }

    if (!ok) {
      if (isForm) {
        return NextResponse.redirect(new URL("/login?error=CredentialsSignin", req.url));
      }
      return NextResponse.json({ error: "로그인에 실패했습니다." }, { status: 401 });
    }

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
    return NextResponse.json(
      { error: "로그인 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
