import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { createActivityLog } from "@/lib/activity-log";
import { closeOpenAwayLogs } from "@/lib/attendance-admin";
import { kstYmdToUtcDayStart, startOfDayKst } from "@/lib/date-kst";
import prisma from "@/lib/prisma";
import { getClientIpFromRequest, getClientUserAgent } from "@/lib/request-client-meta";

function getClientIp(req: Request): string | null {
  return getClientIpFromRequest(req);
}

export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date"); // YYYY-MM-DD (한국 달력)
    const dateStart = dateStr ? kstYmdToUtcDayStart(dateStr) : startOfDayKst(new Date());

    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";

    if (isAdmin) {
      const attendances = await prisma.attendance.findMany({
        where: { date: dateStart },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              department: true,
              position: true,
              currentProject: { select: { name: true, brand: { select: { name: true } } } },
            },
          },
        },
      });
      return NextResponse.json(attendances);
    }

    const mine = await prisma.attendance.findUnique({
      where: {
        userId_date: { userId: session.user.id, date: dateStart },
      },
    });
    return NextResponse.json(mine ?? null);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "출퇴근 기록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const clientIp = getClientIp(req);
    const clientUa = getClientUserAgent(req);

    const body = await req.json();
    const action = body.action as string; // "checkIn" | "checkOut"

    const now = new Date();
    const dateStart = startOfDayKst(now);

    if (action === "checkIn") {
      const existing = await prisma.attendance.findUnique({
        where: { userId_date: { userId: session.user.id, date: dateStart } },
      });
      if (existing?.checkIn) {
        return NextResponse.json(
          { error: "이미 출근 처리되었습니다." },
          { status: 400 }
        );
      }

      const attendance = await prisma.attendance.upsert({
        where: { userId_date: { userId: session.user.id, date: dateStart } },
        update: { checkIn: now, checkInIp: clientIp, checkInUa: clientUa },
        create: {
          userId: session.user.id,
          date: dateStart,
          checkIn: now,
          checkInIp: clientIp,
          checkInUa: clientUa,
        },
      });
      await createActivityLog(session.user.id, "CHECK_IN", "출근", clientIp);
      return NextResponse.json(attendance);
    }

    if (action === "checkOut") {
      const existing = await prisma.attendance.findUnique({
        where: { userId_date: { userId: session.user.id, date: dateStart } },
      });
      if (!existing?.checkIn) {
        return NextResponse.json(
          { error: "먼저 출근 처리해 주세요." },
          { status: 400 }
        );
      }
      if (existing.checkOut) {
        return NextResponse.json(
          { error: "이미 퇴근 처리되었습니다." },
          { status: 400 }
        );
      }

      await closeOpenAwayLogs(session.user.id, now);

      const attendance = await prisma.attendance.update({
        where: { userId_date: { userId: session.user.id, date: dateStart } },
        data: { checkOut: now, checkOutIp: clientIp, checkOutUa: clientUa },
      });
      await createActivityLog(session.user.id, "CHECK_OUT", "퇴근", clientIp);
      return NextResponse.json(attendance);
    }

    return NextResponse.json(
      { error: "action은 checkIn 또는 checkOut 이어야 합니다." },
      { status: 400 }
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "출퇴근 기록에 실패했습니다." },
      { status: 500 }
    );
  }
}
