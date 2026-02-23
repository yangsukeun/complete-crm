import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

/**
 * GET: 현재 사용자의 알림 목록 (최신순, 기본 20개)
 * - unreadOnly: true 이면 미읽음만
 */
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 50);
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    const list = await prisma.notification.findMany({
      where: {
        userId: session.user.id,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json(
      list.map((n) => ({
        id: n.id,
        type: n.type,
        message: n.message,
        link: n.link,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      }))
    );
  } catch (e) {
    console.error("Notifications GET:", e);
    return NextResponse.json(
      { error: "알림을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}
