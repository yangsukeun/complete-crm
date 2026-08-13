import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { closeOpenAwayLogs, requireAwayActor } from "@/lib/attendance-admin";

export const runtime = "nodejs";

export async function POST() {
  try {
    const auth = await requireAwayActor();
    if (!auth.ok) return auth.response;

    const open = await prisma.awayLog.findFirst({
      where: { userId: auth.user.id, endedAt: null },
      select: { id: true },
    });
    if (!open) {
      return NextResponse.json({ error: "진행 중인 이석이 없습니다." }, { status: 400 });
    }

    const now = new Date();
    await closeOpenAwayLogs(auth.user.id, now);
    return NextResponse.json({ open: false, endedAt: now.toISOString() });
  } catch (e) {
    console.error("away end:", e);
    return NextResponse.json({ error: "복귀에 실패했습니다." }, { status: 500 });
  }
}
