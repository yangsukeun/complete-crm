import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAppSession } from "@/auth";

export const runtime = "nodejs";

/** 본인 이석 상태. 권한 없는 직원도 200 + open:false (오버레이 복원용). */
export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const open = await prisma.awayLog.findFirst({
      where: { userId: session.user.id, endedAt: null },
      select: { id: true, type: true, startedAt: true },
    });
    if (!open) {
      return NextResponse.json({ open: false });
    }
    return NextResponse.json({
      open: true,
      id: open.id,
      type: open.type,
      startedAt: open.startedAt.toISOString(),
    });
  } catch (e) {
    console.error("away status:", e);
    return NextResponse.json({ error: "이석 상태를 불러오지 못했습니다." }, { status: 500 });
  }
}
