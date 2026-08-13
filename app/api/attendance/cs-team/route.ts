import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAwayOverview } from "@/lib/attendance-admin";
import { kstDateBoundsUtc, todayYmdKst } from "@/lib/date-kst";
import { computeWorkedMs } from "@/lib/attendance-away-access";
import { isCsSchedulerMember } from "@/lib/schedule-team-access";

export const runtime = "nodejs";

function awayMsForLogs(
  logs: { startedAt: Date; endedAt: Date | null }[],
  now: Date,
): number {
  let total = 0;
  for (const log of logs) {
    const end = log.endedAt ?? now;
    total += Math.max(0, end.getTime() - log.startedAt.getTime());
  }
  return total;
}

export async function GET(req: Request) {
  try {
    const auth = await requireAwayOverview();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("date");
    const dateYmd = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayYmdKst();
    let bounds: { start: Date; end: Date };
    try {
      bounds = kstDateBoundsUtc(dateYmd);
    } catch {
      return NextResponse.json({ error: "날짜가 올바르지 않습니다." }, { status: 400 });
    }

    const now = new Date();
    const allUsers = await prisma.user.findMany({
      select: { id: true, name: true, department: true, position: true, role: true },
      orderBy: { name: "asc" },
    });
    const members = allUsers.filter((u) => isCsSchedulerMember(u));
    const ids = members.map((u) => u.id);

    const [attendances, awayLogs] = await Promise.all([
      ids.length
        ? prisma.attendance.findMany({
            where: { userId: { in: ids }, date: bounds.start },
            select: {
              userId: true,
              checkIn: true,
              checkOut: true,
            },
          })
        : Promise.resolve([]),
      ids.length
        ? prisma.awayLog.findMany({
            where: {
              userId: { in: ids },
              startedAt: { gte: bounds.start, lt: bounds.end },
            },
            select: { userId: true, type: true, startedAt: true, endedAt: true },
          })
        : Promise.resolve([]),
    ]);

    const attByUser = new Map(attendances.map((a) => [a.userId, a]));
    const awayByUser = new Map<string, typeof awayLogs>();
    for (const log of awayLogs) {
      const list = awayByUser.get(log.userId) ?? [];
      list.push(log);
      awayByUser.set(log.userId, list);
    }

    const rows = members.map((u) => {
      const att = attByUser.get(u.id);
      const logs = awayByUser.get(u.id) ?? [];
      const awayMs = awayMsForLogs(logs, now);
      const open = logs.find((l) => l.endedAt == null) ?? null;
      const workedMs = computeWorkedMs({
        checkIn: att?.checkIn ?? null,
        checkOut: att?.checkOut ?? null,
        awayMs,
        nowMs: now.getTime(),
        dayEndMs: bounds.end.getTime(),
      });
      let status: "AWAY" | "OUT" | "IN" | "ABSENT" = "ABSENT";
      if (open) status = "AWAY";
      else if (att?.checkOut) status = "OUT";
      else if (att?.checkIn) status = "IN";

      return {
        userId: u.id,
        name: u.name,
        department: u.department,
        position: u.position,
        checkIn: att?.checkIn?.toISOString() ?? null,
        checkOut: att?.checkOut?.toISOString() ?? null,
        awayMs,
        workedMs,
        status,
        awayOpenType: open?.type ?? null,
      };
    });

    return NextResponse.json({
      date: dateYmd,
      now: now.toISOString(),
      members: rows,
    });
  } catch (e) {
    console.error("cs-team attendance:", e);
    return NextResponse.json({ error: "CS 근태를 불러오지 못했습니다." }, { status: 500 });
  }
}
