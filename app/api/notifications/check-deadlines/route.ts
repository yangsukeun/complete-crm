import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { checkDeadlines } from "@/lib/notifications";

/**
 * POST: 마감 임박 알림 생성 (Cron 또는 수동 호출)
 * 관리자만 호출 가능하거나, 나중에 Vercel Cron 시크릿으로 보호
 */
export async function POST() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const role = (session.user as { role?: string }).role;
    if (role !== "EXECUTIVE" && role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await checkDeadlines();
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Check deadlines:", e);
    return NextResponse.json(
      { error: "마감 알림 생성에 실패했습니다." },
      { status: 500 }
    );
  }
}
