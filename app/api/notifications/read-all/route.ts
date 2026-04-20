import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { cancelOneSignalPush, syncBadgeCount } from "@/lib/onesignal/cancel";

export async function PATCH() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const targets = await prisma.notification.findMany({
      where: { userId: session.user.id, isRead: false },
      select: { oneSignalNotificationId: true },
    });
    await prisma.notification.updateMany({
      where: { userId: session.user.id, isRead: false },
      data: { isRead: true },
    });

    const osIds = targets
      .map((n) => n.oneSignalNotificationId)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
    if (osIds.length > 0) {
      await Promise.allSettled(osIds.map((id) => cancelOneSignalPush(id)));
    }
    await syncBadgeCount(session.user.id, 0);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Notifications read-all:", e);
    return NextResponse.json(
      { error: "알림을 일괄 읽음 처리할 수 없습니다." },
      { status: 500 }
    );
  }
}
