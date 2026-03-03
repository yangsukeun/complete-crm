import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

/** 내가 받은 일정 공유 초대 (PENDING만) */
export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const invites = await prisma.scheduleInvite.findMany({
      where: { toUserId: session.user.id, status: "PENDING" },
      include: {
        schedule: true,
          fromUser: {
            select: {
              id: true,
              name: true,
              position: true,
              currentProject: { select: { name: true, brand: { select: { name: true } } } },
            },
          },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(invites);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "초대 목록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}
