import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

/** 자금 관리 페이지 진입 시 본인 알람 전체 읽음 처리 (팀장/이체담당자/요청자 공통) */
export async function POST() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const now = new Date().toISOString();
    await prisma.$executeRawUnsafe(
      'UPDATE "PaymentRequestAlert" SET "readAt" = $1::timestamptz WHERE "userId" = $2 AND "readAt" IS NULL',
      now,
      session.user.id
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "알람 읽음 처리에 실패했습니다." }, { status: 500 });
  }
}
