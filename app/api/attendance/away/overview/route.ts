import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAwayOverview } from "@/lib/attendance-admin";
import { addDaysKstYmd, kstDateBoundsUtc, kstYmdToUtcDayStart, todayYmdKst } from "@/lib/date-kst";
import { getKstWeekday } from "@/lib/date-kst";
import { isCsBirthdayToday } from "@/lib/cs-org";
import { isCsSchedulerMember } from "@/lib/schedule-team-access";

export const runtime = "nodejs";

function mondayYmdKst(ymd: string): string {
  const wd = getKstWeekday(new Date(`${ymd}T12:00:00+09:00`));
  const offset = wd === 0 ? -6 : 1 - wd;
  return addDaysKstYmd(ymd, offset);
}

function monthStartYmd(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

function durationMs(startedAt: Date, endedAt: Date | null, now: Date): number {
  const end = endedAt ?? now;
  return Math.max(0, end.getTime() - startedAt.getTime());
}

type Totals = {
  count: number;
  durationMs: number;
};

function emptyTotals(): Totals {
  return {
    count: 0,
    durationMs: 0,
  };
}

function addLog(t: Totals, ms: number) {
  t.count += 1;
  t.durationMs += ms;
}

export async function GET() {
  try {
    const auth = await requireAwayOverview();
    if (!auth.ok) return auth.response;

    const now = new Date();
    const today = todayYmdKst();
    const weekStart = mondayYmdKst(today);
    const monthStart = monthStartYmd(today);
    const from = kstYmdToUtcDayStart(monthStart);

    const [openRows, monthRows] = await Promise.all([
      prisma.awayLog.findMany({
        where: { endedAt: null },
        include: { user: { select: { id: true, name: true, department: true, role: true, birthDate: true } } },
        orderBy: { startedAt: "asc" },
      }),
      prisma.awayLog.findMany({
        where: { startedAt: { gte: from } },
        include: { user: { select: { id: true, name: true, department: true, role: true, birthDate: true } } },
      }),
    ]);

    const csOpen = openRows.filter((r) => isCsSchedulerMember(r.user));
    const csMonth = monthRows.filter((r) => isCsSchedulerMember(r.user));

    const todayStart = kstDateBoundsUtc(today).start.getTime();
    const weekStartMs = kstYmdToUtcDayStart(weekStart).getTime();
    const monthStartMs = from.getTime();

    const byUser = new Map<
      string,
      {
        userId: string;
        name: string;
        department: string | null;
        birthdayToday: boolean;
        today: Totals;
        week: Totals;
        month: Totals;
      }
    >();

    const ensure = (userId: string, name: string, department: string | null, birthdayToday: boolean) => {
      let row = byUser.get(userId);
      if (!row) {
        row = {
          userId,
          name,
          department,
          birthdayToday,
          today: emptyTotals(),
          week: emptyTotals(),
          month: emptyTotals(),
        };
        byUser.set(userId, row);
      }
      return row;
    };

    for (const row of csMonth) {
      const ms = durationMs(row.startedAt, row.endedAt, now);
      const startMs = row.startedAt.getTime();
      const agg = ensure(
        row.user.id,
        row.user.name,
        row.user.department,
        isCsBirthdayToday(row.user.birthDate, now)
      );
      addLog(agg.month, ms);
      if (startMs >= weekStartMs) addLog(agg.week, ms);
      if (startMs >= todayStart) addLog(agg.today, ms);
    }

    return NextResponse.json({
      now: now.toISOString(),
      current: csOpen.map((r) => ({
        id: r.id,
        userId: r.user.id,
        name: r.user.name,
        department: r.user.department,
        startedAt: r.startedAt.toISOString(),
        elapsedMs: now.getTime() - r.startedAt.getTime(),
        birthdayToday: isCsBirthdayToday(r.user.birthDate, now),
      })),
      totals: [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name, "ko")),
    });
  } catch (e) {
    console.error("away overview:", e);
    return NextResponse.json({ error: "이석 현황을 불러오지 못했습니다." }, { status: 500 });
  }
}
