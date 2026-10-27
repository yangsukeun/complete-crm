import {WORKSPACE_OWNER} from "@/lib/workspace-areas";
import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

/**
 * GET: 현재 사용자의 알림 목록 (최신순, 기본 20개)
 * - unreadOnly: true 이면 미읽음만
 */
export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const rawLimit = Number(searchParams.get("limit"));
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 20, 1), 50);
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    const list = await prisma.notification.findMany({
      where: {
        userId: session.user.id,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      /** 미읽음 우선 → 동일 시각대에서는 최신순 */
      orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        type: true,
        message: true,
        link: true,
        isRead: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      list.map((n) => ({
        id: n.id,
        type: n.type,
        message: n.type === "PAYMENT_REQUEST" && session.user.id !== WORKSPACE_OWNER ? "결제 요청 내역이 변경되었습니다. 권한이 있는 내역은 결제 요청 화면에서 확인하세요." : n.message,
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
