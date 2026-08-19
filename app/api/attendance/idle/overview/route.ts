import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAwayOverview } from "@/lib/attendance-admin";
import { kstDateBoundsUtc, todayYmdKst } from "@/lib/date-kst";
import { buildIdleLiveStatus, groupIdleDailySummary } from "@/lib/attendance-idle";

export const runtime = "nodejs";

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
    const [devices, sessions] = await Promise.all([
      prisma.deviceStatus.findMany(),
      prisma.idleSession.findMany({
        where: { idleStart: { gte: bounds.start, lt: bounds.end } },
        orderBy: { idleStart: "desc" },
      }),
    ]);

    const liveStatus = buildIdleLiveStatus(devices, now);
    const dailySummary = groupIdleDailySummary(sessions);

    const employeeIds = [...new Set([...liveStatus.map((r) => r.employeeId), ...dailySummary.map((r) => r.employeeId)])];
    const users =
      employeeIds.length === 0
        ? []
        : await prisma.user.findMany({
            where: { id: { in: employeeIds } },
            select: { id: true, name: true, department: true },
          });
    const userById = new Map(users.map((u) => [u.id, u]));

    return NextResponse.json({
      now: now.toISOString(),
      date: dateYmd,
      liveStatus: liveStatus.map((row) => {
        const user = userById.get(row.employeeId);
        return {
          employeeId: row.employeeId,
          name: user?.name ?? null,
          department: user?.department ?? null,
          status: row.status,
          lastSeen: row.lastSeen,
        };
      }),
      dailySummary: dailySummary.map((row) => {
        const user = userById.get(row.employeeId);
        return {
          employeeId: row.employeeId,
          name: user?.name ?? null,
          department: user?.department ?? null,
          totalDurationSeconds: row.totalDurationSeconds,
          sessionCount: row.sessionCount,
          sessions: row.sessions,
        };
      }),
    });
  } catch (e) {
    console.error("idle overview:", e);
    return NextResponse.json({ error: "자동 이석 현황을 불러오지 못했습니다." }, { status: 500 });
  }
}
