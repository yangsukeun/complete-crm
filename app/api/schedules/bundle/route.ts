import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
const userListSelect = { name: true, position: true } as const;

function defaultRange(): { from: Date; to: Date } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const from = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const to = new Date(y, m + 2, 0, 23, 59, 59, 999);
  return { from, to };
}

function parseRange(req: Request): { from: Date; to: Date } {
  const sp = new URL(req.url).searchParams;
  const fromRaw = sp.get("from");
  const toRaw = sp.get("to");
  if (fromRaw && toRaw) {
    const from = new Date(fromRaw);
    const to = new Date(toRaw);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to) {
      return { from, to };
    }
  }
  return defaultRange();
}

/**
 * 캘린더용: MY·TEAM 일정을 한 번의 인증으로 병렬 조회 (HTTP/세션 왕복 절약).
 * from/to(ISO) 권장. 미지정 시 현재 월 ±1개월(대략) 기본.
 */
export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { from, to } = parseRange(req);
    const rangeWhere = {
      startTime: { lte: to },
      endTime: { gte: from },
    };

    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    const uid = session.user.id;

    const personalWhere = { scope: "PERSONAL" as const, userId: uid, ...rangeWhere };
    const teamWhere = {
      scope: "TEAM" as const,
      ...(isAdmin ? {} : { userId: uid }),
      ...rangeWhere,
    };

    const select = {
      id: true,
      title: true,
      description: true,
      startTime: true,
      endTime: true,
      isAllDay: true,
      userId: true,
      scope: true,
      user: { select: userListSelect },
    } as const;

    const [personal, team] = await Promise.all([
      prisma.schedule.findMany({
        where: personalWhere,
        select,
        orderBy: { startTime: "asc" },
      }),
      prisma.schedule.findMany({
        where: teamWhere,
        select,
        orderBy: { startTime: "asc" },
      }),
    ]);

    return NextResponse.json(
      { personal, team, from: from.toISOString(), to: to.toISOString() },
      {
        headers: {
          "Cache-Control": "private, no-cache, max-age=0, must-revalidate",
        },
      }
    );
  } catch (e) {
    console.error("[GET /api/schedules/bundle]", e);
    return NextResponse.json({ error: "일정을 불러올 수 없습니다." }, { status: 500 });
  }
}
