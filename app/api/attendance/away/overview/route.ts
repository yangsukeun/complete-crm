import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAwayOverview } from "@/lib/attendance-admin";
import {
  addDaysKstYmd,
  getKstWeekday,
  kstDateBoundsUtc,
  kstYmdToUtcDayStart,
  toKstYmd,
  todayYmdKst,
} from "@/lib/date-kst";
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

type Session = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  ymd: string;
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

    const weekDays = Array.from({ length: 7 }, (_, i) => addDaysKstYmd(weekStart, i));

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
        byYmd: Record<string, Totals>;
        sessions: Session[];
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
          byYmd: Object.fromEntries(weekDays.map((d) => [d, emptyTotals()])),
          sessions: [],
        };
        byUser.set(userId, row);
      }
      return row;
    };

    for (const row of csMonth) {
      const ms = durationMs(row.startedAt, row.endedAt, now);
      const startMs = row.startedAt.getTime();
      const ymd = toKstYmd(row.startedAt);
      const agg = ensure(
        row.user.id,
        row.user.name,
        row.user.department,
        isCsBirthdayToday(row.user.birthDate, now)
      );
      agg.sessions.push({
        id: row.id,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt ? row.endedAt.toISOString() : null,
        durationMs: ms,
        ymd,
      });
      addLog(agg.month, ms);
      if (startMs >= weekStartMs) addLog(agg.week, ms);
      if (startMs >= todayStart) addLog(agg.today, ms);
      if (!agg.byYmd[ymd]) agg.byYmd[ymd] = emptyTotals();
      addLog(agg.byYmd[ymd], ms);
    }

    const totals = [...byUser.values()]
      .map((row) => ({
        ...row,
        sessions: row.sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));

    return NextResponse.json({
      now: now.toISOString(),
      today,
      weekStart,
      weekDays,
      current: csOpen.map((r) => ({
        id: r.id,
        userId: r.user.id,
        name: r.user.name,
        department: r.user.department,
        startedAt: r.startedAt.toISOString(),
        elapsedMs: now.getTime() - r.startedAt.getTime(),
        birthdayToday: isCsBirthdayToday(r.user.birthDate, now),
      })),
      totals,
    });
  } catch (e) {
    console.error("away overview:", e);
    return NextResponse.json({ error: "이석 현황을 불러오지 못했습니다." }, { status: 500 });
  }
}
