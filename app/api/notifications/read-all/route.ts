import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { autoReadNotifications } from "@/lib/notifications/auto-read";

export async function PATCH() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const out = await autoReadNotifications({ userId: session.user.id, all: true });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    console.error("Notifications read-all:", e);
    return NextResponse.json(
      { error: "알림을 일괄 읽음 처리할 수 없습니다." },
      { status: 500 }
    );
  }
}
