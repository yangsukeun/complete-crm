import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { createActivityLog } from "@/lib/activity-log";
import prisma from "@/lib/prisma";
import { startOfDay } from "date-fns";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function startOfDayKst(date: Date): Date {
  // 한국은 DST 없음. KST 기준 00:00을 UTC Date로 변환해 저장/조회 기준을 맞춤.
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const kstStart = startOfDay(kst);
  return new Date(kstStart.getTime() - KST_OFFSET_MS);
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip") ?? null;
}

export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date"); // YYYY-MM-DD
    const today = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
    const dateStart = startOfDayKst(today);

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
        update: { checkIn: now },
        create: {
          userId: session.user.id,
          date: dateStart,
          checkIn: now,
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

      const attendance = await prisma.attendance.update({
        where: { userId_date: { userId: session.user.id, date: dateStart } },
        data: { checkOut: now },
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
