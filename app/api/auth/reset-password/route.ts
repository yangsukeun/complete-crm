import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hash } from "bcryptjs";

/**
 * 비밀번호 재설정 API (Route Handler).
 * Vercel 서버리스에서 Server Action 대신 이 경로를 쓰면 연결/타임아웃 문제가 적음.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword.trim() : "";
    const confirmPassword = typeof body?.confirmPassword === "string" ? body.confirmPassword.trim() : "";

    if (!email) {
      return NextResponse.json({ error: "이메일을 입력하세요." }, { status: 400 });
    }
    if (newPassword.length < 4) {
      return NextResponse.json({ error: "비밀번호는 4자 이상 입력하세요." }, { status: 400 });
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: "새 비밀번호와 확인이 일치하지 않습니다." }, { status: 400 });
    }

    const emailNormalized = email.toLowerCase();
    const user = await prisma.user.findFirst({
      where: { email: { equals: emailNormalized, mode: "insensitive" } },
    });
    if (!user) {
      return NextResponse.json({ error: "해당 이메일로 등록된 사용자가 없습니다." }, { status: 404 });
    }

    const hashedPassword = await hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    const err = e as Error & { code?: string; message?: string };
    console.error("[api/auth/reset-password]", err);
    const msg = String(err?.message ?? "");
    const code = err?.code;

    if (
      code === "P1001" ||
      code === "P1002" ||
      code === "P1003" ||
      msg.includes("connect") ||
      msg.includes("Connection") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("timeout") ||
      msg.includes("Timed out")
    ) {
      return NextResponse.json(
        {
          error:
            "데이터베이스에 연결할 수 없습니다. Vercel 환경 변수 DATABASE_URL을 Supabase '연결 풀러' 주소(포트 6543)로 설정하고, 끝에 ?pgbouncer=true 를 붙인 뒤 재배포하세요.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "비밀번호 재설정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
