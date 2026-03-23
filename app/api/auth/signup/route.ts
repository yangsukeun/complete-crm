import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { hash } from "bcryptjs";
import { z } from "zod";

const signupSchema = z.object({
  email: z.string().email("올바른 이메일을 입력하세요."),
  password: z.string().min(4, "비밀번호는 4자 이상이어야 합니다."),
  name: z.string().min(1, "이름을 입력하세요."),
});

/**
 * 숨겨진 관리자 가입용 API.
 * 생성되는 계정은 role ADMIN으로 저장됩니다. (초기 설정용)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((e) => e.message).join(" ");
      return NextResponse.json({ error: msg || "입력값이 올바르지 않습니다." }, { status: 400 });
    }

    const emailNormalized = parsed.data.email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({
      where: { email: emailNormalized },
    });
    if (existing) {
      return NextResponse.json(
        { error: "이미 사용 중인 이메일입니다." },
        { status: 400 }
      );
    }

    const rawPassword = parsed.data.password.trim();
    if (rawPassword.length < 4) {
      return NextResponse.json({ error: "비밀번호는 4자 이상이어야 합니다." }, { status: 400 });
    }
    const hashedPassword = await hash(rawPassword, 10);

    await prisma.user.create({
      data: {
        email: emailNormalized,
        password: hashedPassword,
        name: parsed.data.name.trim(),
        role: "ADMIN",
      },
    });

    revalidateTag("users-list", "max");

    return NextResponse.json({ success: true, message: "계정이 생성되었습니다. 로그인 페이지에서 로그인하세요." });
  } catch (e) {
    const err = e as Error & { code?: string };
    console.error("[signup]", err);
    const isDev = process.env.NODE_ENV === "development";
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "이미 사용 중인 이메일입니다." }, { status: 400 });
    }
    if (err?.code === "P1001" || err?.message?.includes("connect") || err?.message?.includes("Connection")) {
      return NextResponse.json(
        { error: "데이터베이스에 연결할 수 없습니다. Vercel에서 DATABASE_URL 환경 변수를 확인하세요." },
        { status: 503 }
      );
    }
    const message = isDev && err?.message ? err.message : "회원가입 처리 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
