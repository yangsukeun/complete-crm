import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAwayOverview } from "@/lib/attendance-admin";
import { addDaysKstYmd, kstYmdToUtcDayStart, todayYmdKst } from "@/lib/date-kst";
import { isCsBirthdayToday } from "@/lib/cs-org";
import {
  buildIdleCurrent,
  buildIdleLiveStatus,
  groupIdleWeekMonth,
  matchIdleEmployee,
  mondayYmdKst,
  monthStartYmd,
} from "@/lib/attendance-idle";

export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await requireAwayOverview();
    if (!auth.ok) return auth.response;

    const now = new Date();
    const today = todayYmdKst();
    const weekStart = mondayYmdKst(today);
    const monthStart = monthStartYmd(today);
    const from = kstYmdToUtcDayStart(monthStart);
    const weekDays = Array.from({ length: 7 }, (_, i) => addDaysKstYmd(weekStart, i));

    const [devices, monthRows] = await Promise.all([
      prisma.deviceStatus.findMany(),
      prisma.idleSession.findMany({
        where: { idleStart: { gte: from } },
        orderBy: { idleStart: "desc" },
      }),
    ]);

    const employeeIds = [
      ...new Set([...devices.map((d) => d.employeeId), ...monthRows.map((s) => s.employeeId)]),
    ];
    const users =
      employeeIds.length === 0
        ? []
        : await prisma.user.findMany({
            where: {
              OR: [
                { id: { in: employeeIds } },
                { name: { in: employeeIds } },
                ...employeeIds.map((id) => ({ email: { startsWith: `${id}@` } })),
              ],
            },
            select: { id: true, name: true, department: true, birthDate: true, email: true },
          });

    const people = new Map(
      employeeIds.map((id) => {
        const u = matchIdleEmployee(id, users);
        return [
          id,
          {
            name: u?.name ?? id,
            department: u?.department ?? null,
            birthdayToday: u ? isCsBirthdayToday(u.birthDate, now) : false,
          },
        ] as const;
      })
    );

    return NextResponse.json({
      now: now.toISOString(),
      today,
      weekStart,
      weekDays,
      current: buildIdleCurrent(devices, now, people),
      totals: groupIdleWeekMonth({
        sessions: monthRows,
        now,
        today,
        weekStart,
        weekDays,
        people,
      }),
      liveStatus: buildIdleLiveStatus(devices, now),
    });
  } catch (e) {
    console.error("idle overview:", e);
    return NextResponse.json({ error: "자동 이석 현황을 불러오지 못했습니다." }, { status: 500 });
  }
}
