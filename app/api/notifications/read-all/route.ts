import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

export async function PATCH() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.notification.updateMany({
      where: { userId: session.user.id, isRead: false },
      data: { isRead: true },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Notifications read-all:", e);
    return NextResponse.json(
      { error: "알림을 일괄 읽음 처리할 수 없습니다." },
      { status: 500 }
    );
  }
}
