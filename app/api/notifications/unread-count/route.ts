import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const count = await prisma.notification.count({
      where: {
        userId: session.user.id,
        isRead: false,
      },
    });

    return NextResponse.json(
      { count },
      {
        headers: {
          "Cache-Control":
            "private, max-age=15, stale-while-revalidate=120, stale-if-error=60",
        },
      }
    );
  } catch (e) {
    console.error("Notifications unread-count:", e);
    return NextResponse.json(
      { error: "알림 개수를 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}
