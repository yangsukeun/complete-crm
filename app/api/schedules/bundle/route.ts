import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
const userListSelect = { name: true, position: true } as const;

/**
 * 캘린더용: MY·TEAM 일정을 한 번의 인증으로 병렬 조회 (HTTP/세션 왕복 절약).
 */
export async function GET(_req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    const uid = session.user.id;

    const personalWhere = { scope: "PERSONAL" as const, userId: uid };
    const teamWhere = {
      scope: "TEAM" as const,
      ...(isAdmin ? {} : { userId: uid }),
    };

    const [personal, team] = await Promise.all([
      prisma.schedule.findMany({
        where: personalWhere,
        select: {
          id: true,
          title: true,
          description: true,
          startTime: true,
          endTime: true,
          isAllDay: true,
          userId: true,
          scope: true,
          user: { select: userListSelect },
        },
        orderBy: { startTime: "asc" },
      }),
      prisma.schedule.findMany({
        where: teamWhere,
        select: {
          id: true,
          title: true,
          description: true,
          startTime: true,
          endTime: true,
          isAllDay: true,
          userId: true,
          scope: true,
          user: { select: userListSelect },
        },
        orderBy: { startTime: "asc" },
      }),
    ]);

    return NextResponse.json(
      { personal, team },
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
