import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { autoReadNotifications } from "@/lib/notifications/auto-read";

/**
 * PATCH: 알림 읽음 처리 (isRead: true)
 */
export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const out = await autoReadNotifications({ userId: session.user.id, notificationIds: [id] });
    // 기존 동작 호환: 없는 id는 멱등 성공으로 처리(클라이언트 낙관적 UI 유지)
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    console.error("Notification read PATCH:", e);
    return NextResponse.json(
      { error: "읽음 처리에 실패했습니다." },
      { status: 500 }
    );
  }
}
