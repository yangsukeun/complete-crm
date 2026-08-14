import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAwayActor } from "@/lib/attendance-admin";
import { startOfDayKst } from "@/lib/date-kst";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await requireAwayActor();
    if (!auth.ok) return auth.response;

    await req.json().catch(() => null);

    const now = new Date();
    const dateStart = startOfDayKst(now);
    const today = await prisma.attendance.findUnique({
      where: { userId_date: { userId: auth.user.id, date: dateStart } },
      select: { checkIn: true, checkOut: true },
    });
    if (!today?.checkIn || today.checkOut) {
      return NextResponse.json(
        { error: "출근 후에만 이석할 수 있습니다." },
        { status: 400 },
      );
    }

    const open = await prisma.awayLog.findFirst({
      where: { userId: auth.user.id, endedAt: null },
      select: { id: true },
    });
    if (open) {
      return NextResponse.json({ error: "이미 이석 중입니다." }, { status: 409 });
    }

    const row = await prisma.awayLog.create({
      data: {
        userId: auth.user.id,
        type: "AWAY",
        startedAt: now,
      },
      select: { id: true, type: true, startedAt: true, endedAt: true },
    });

    return NextResponse.json({
      open: true,
      id: row.id,
      type: row.type,
      startedAt: row.startedAt.toISOString(),
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "이미 이석 중입니다." }, { status: 409 });
    }
    console.error("away start:", e);
    return NextResponse.json({ error: "이석을 시작하지 못했습니다." }, { status: 500 });
  }
}
