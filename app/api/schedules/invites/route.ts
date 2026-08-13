import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { loadCsSchedulerUserIds } from "@/lib/schedule-team-access-db";
import { sameScheduleSharePool } from "@/lib/schedule-team-access";

/** 내가 받은 일정 공유 초대 (PENDING만) */
export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const csUserIds = await loadCsSchedulerUserIds();
    const invites = await prisma.scheduleInvite.findMany({
      where: { toUserId: session.user.id, status: "PENDING" },
      include: {
        schedule: {
          select: {
            id: true,
            title: true,
            startTime: true,
            endTime: true,
          },
        },
        fromUser: {
          select: { id: true, name: true, position: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const visible = invites.filter((inv) =>
      sameScheduleSharePool(inv.fromUserId, session.user.id, csUserIds),
    );

    return NextResponse.json(visible);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "초대 목록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}
