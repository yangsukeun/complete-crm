import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hash } from "bcryptjs";

const DEV_PASSWORD = "dev1234";

/**
 * 개발 환경에서만: 지정 이메일 계정 비밀번호를 dev1234 로 설정.
 * 로그인 테스트용. 프로덕션에서는 404.
 */
export async function POST(req: Request) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  ) {
    return new Response(null, { status: 404 });
  }
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof (body as { email?: string }).email === "string"
      ? (body as { email: string }).email.trim().toLowerCase()
      : "";
    if (!email) {
      return NextResponse.json({ error: "email 필요" }, { status: 400 });
    }
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, email: true },
    });
    if (!user) {
      return NextResponse.json({ error: "해당 이메일 사용자 없음" }, { status: 404 });
    }
    const hashed = await hash(DEV_PASSWORD, 10);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
    return NextResponse.json({
      ok: true,
      message: `${user.email} 비밀번호가 dev1234 로 설정되었습니다. 로그인 페이지에서 이메일 + dev1234 로 로그인하세요.`,
    });
  } catch (e) {
    console.error("[dev-reset-password]", e);
    return NextResponse.json({ error: "처리 실패" }, { status: 500 });
  }
}
