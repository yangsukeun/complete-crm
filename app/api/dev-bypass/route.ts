import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hash } from "bcryptjs";

const DEV_PASSWORD = "dev1234";

/**
 * 개발 전용: 첫 번째 관리자(또는 첫 사용자) 비밀번호를 dev1234로 맞추고 이메일을 반환.
 * 로그인 우회용 — 프론트에서 이 이메일 + dev1234 로 로그인하면 됨.
 */
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available." }, { status: 403 });
  }
  try {
    const user = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true },
    });
    if (!user) {
      const anyUser = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, email: true } });
      if (!anyUser) return NextResponse.json({ error: "등록된 사용자가 없습니다. /signup 에서 먼저 가입하세요." }, { status: 404 });
      const hashed = await hash(DEV_PASSWORD, 10);
      await prisma.user.update({ where: { id: anyUser.id }, data: { password: hashed } });
      return NextResponse.json({ email: anyUser.email, password: DEV_PASSWORD });
    }
    const hashed = await hash(DEV_PASSWORD, 10);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
    return NextResponse.json({ email: user.email, password: DEV_PASSWORD });
  } catch (e) {
    console.error("[dev-bypass]", e);
    return NextResponse.json({ error: "처리 실패" }, { status: 500 });
  }
}
