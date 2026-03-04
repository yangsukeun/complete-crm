import { NextResponse } from "next/server";
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

    return NextResponse.json({ success: true, message: "계정이 생성되었습니다. 로그인 페이지에서 로그인하세요." });
  } catch (e) {
    console.error("[signup]", e);
    return NextResponse.json(
      { error: "회원가입 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
