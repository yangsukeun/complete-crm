import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hash, compare } from "bcryptjs";
import { z } from "zod";

const bodySchema = z.object({
  email: z.string().email(),
  newPassword: z.string().min(4, "비밀번호는 4자 이상이어야 합니다."),
});

/**
 * 이메일로 사용자 비밀번호를 재설정합니다.
 * - 개발: 별도 인증 없이 호출 가능
 * - 프로덕션: 쿼리 또는 헤더에 RESET_PASSWORD_SECRET 일치 시에만 동작
 */
export async function POST(req: Request) {
  const isDev = process.env.NODE_ENV === "development";
  const secret = process.env.RESET_PASSWORD_SECRET;
  if (!isDev) {
    const url = new URL(req.url);
    const querySecret = url.searchParams.get("secret");
    const headerSecret = req.headers.get("x-reset-password-secret");
    if (!secret || (querySecret !== secret && headerSecret !== secret)) {
      return NextResponse.json({ error: "Not available in production without secret." }, { status: 403 });
    }
  }

  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((e) => e.message).join(" ");
      return NextResponse.json({ error: msg || "입력값이 올바르지 않습니다." }, { status: 400 });
    }

    const emailNormalized = parsed.data.email.trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: { email: { equals: emailNormalized, mode: "insensitive" } },
    });
    if (!user) {
      return NextResponse.json({ error: "해당 이메일로 등록된 사용자가 없습니다." }, { status: 404 });
    }

    const newPasswordTrimmed = parsed.data.newPassword.trim();
    const hashedPassword = await hash(newPasswordTrimmed, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    const updated = await prisma.user.findUnique({
      where: { id: user.id },
      select: { password: true },
    });
    const verified = !!updated && (await compare(newPasswordTrimmed, updated.password));

    return NextResponse.json({
      success: true,
      message: "비밀번호가 재설정되었습니다. 새 비밀번호로 로그인하세요.",
      verified,
      hint: verified
        ? "검증 성공. 이제 로그인 화면에서 같은 비밀번호로 로그인해 보세요."
        : "저장은 됐지만 검증 실패. DB/인코딩 문제일 수 있습니다.",
    });
  } catch (e) {
    console.error("[reset-initial-password]", e);
    return NextResponse.json(
      { error: "비밀번호 재설정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
