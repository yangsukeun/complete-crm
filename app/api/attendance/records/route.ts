import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAttendanceImport } from "@/lib/attendance-admin";
import { kstYmdToUtcDayStart, toKstYmd } from "@/lib/date-kst";

export const runtime = "nodejs";

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatHmKst(value: Date): string {
  const kst = new Date(value.getTime() + 9 * 60 * 60 * 1000);
  return `${pad2(kst.getUTCHours())}:${pad2(kst.getUTCMinutes())}`;
}

function machineNoSortKey(no: string | null): [number, string] {
  const s = (no ?? "").trim();
  const n = Number(s);
  if (s && Number.isFinite(n)) return [n, s];
  return [Number.POSITIVE_INFINITY, s];
}

export async function GET(req: Request) {
  try {
    const auth = await requireAttendanceImport();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const kst = toKstYmd(now);
    const defaultYear = Number(kst.slice(0, 4));
    const defaultMonth = Number(kst.slice(5, 7));
    const year = Number(searchParams.get("year") ?? defaultYear);
    const month = Number(searchParams.get("month") ?? defaultMonth);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "year, month가 올바르지 않습니다." }, { status: 400 });
    }

    const lastDay = daysInMonth(year, month);
    const from = kstYmdToUtcDayStart(`${year}-${pad2(month)}-01`);
    const to = kstYmdToUtcDayStart(
      month === 12 ? `${year + 1}-01-01` : `${year}-${pad2(month + 1)}-01`,
    );

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { attendanceMachineNo: { not: null } },
          { attendanceRecords: { some: { date: { gte: from, lt: to } } } },
        ],
      },
      select: {
        id: true,
        name: true,
        department: true,
        attendanceMachineNo: true,
      },
    });
    users.sort((a, b) => {
      const [an, as] = machineNoSortKey(a.attendanceMachineNo);
      const [bn, bs] = machineNoSortKey(b.attendanceMachineNo);
      if (an !== bn) return an - bn;
      return as.localeCompare(bs, "ko");
    });

    const userIds = users.map((u) => u.id);

    const [machineRows, buttonRows] = await Promise.all([
      userIds.length
        ? prisma.attendanceRecord.findMany({
            where: {
              userId: { in: userIds },
              date: { gte: from, lt: to },
              source: "MACHINE_IMPORT",
            },
          })
        : Promise.resolve([]),
      userIds.length
        ? prisma.attendance.findMany({
            where: {
              userId: { in: userIds },
              date: { gte: from, lt: to },
            },
            select: { userId: true, date: true, checkIn: true, checkOut: true },
          })
        : Promise.resolve([]),
    ]);

    type Cell = {
      date: string;
      clockIn: string | null;
      clockOut: string | null;
      incomplete: boolean;
      hasButton: boolean;
      source: "MACHINE_IMPORT" | "BUTTON" | null;
    };

    const cells = new Map<string, Cell>();
    const keyOf = (userId: string, date: string) => `${userId}|${date}`;

    for (const row of machineRows) {
      const date = toKstYmd(row.date);
      cells.set(keyOf(row.userId, date), {
        date,
        clockIn: row.clockIn ? formatHmKst(row.clockIn) : null,
        clockOut: row.clockOut ? formatHmKst(row.clockOut) : null,
        incomplete: row.incomplete,
        hasButton: false,
        source: "MACHINE_IMPORT",
      });
    }

    for (const row of buttonRows) {
      const date = toKstYmd(row.date);
      const k = keyOf(row.userId, date);
      const existing = cells.get(k);
      if (existing) {
        existing.hasButton = true;
        continue;
      }
      cells.set(k, {
        date,
        clockIn: row.checkIn ? formatHmKst(row.checkIn) : null,
        clockOut: row.checkOut ? formatHmKst(row.checkOut) : null,
        incomplete: false,
        hasButton: true,
        source: "BUTTON",
      });
    }

    const days = Array.from({ length: lastDay }, (_, i) => i + 1);

    return NextResponse.json({
      year,
      month,
      days,
      employees: users.map((u) => ({
        userId: u.id,
        name: u.name,
        department: u.department,
        machineNo: u.attendanceMachineNo,
        days: days.map((d) => {
          const date = `${year}-${pad2(month)}-${pad2(d)}`;
          return cells.get(keyOf(u.id, date)) ?? {
            date,
            clockIn: null,
            clockOut: null,
            incomplete: false,
            hasButton: false,
            source: null,
          };
        }),
      })),
    });
  } catch (e) {
    console.error("attendance records:", e);
    return NextResponse.json({ error: "근태 조회에 실패했습니다." }, { status: 500 });
  }
}
