import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

function isMissingLastReadAtColumnError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    msg.includes("lastreadat") ||
    msg.includes("last_read_at") ||
    (msg.includes("unknown arg") && msg.includes("lastread")) ||
    (msg.includes("column") && msg.includes("does not exist") && msg.includes("lastread"))
  );
}

/**
 * 내가 참여한 채팅방 중 "상대가 보낸 마지막 메시지 시각"이 lastReadAt 이후인 방의 개수.
 * (lastReadAt 컬럼이 아직 없는 DB면 CHAT_MESSAGE 알림 카운트로 폴백)
 */
export async function GET(_req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    let participants: { chatId: string; lastReadAt: Date | null }[] = [];
    try {
      participants = await prisma.chatParticipant.findMany({
        where: { userId },
        select: { chatId: true, lastReadAt: true },
      });
    } catch (e) {
      if (!isMissingLastReadAtColumnError(e)) throw e;
      const fallbackCount = await prisma.notification.count({
        where: { userId, type: "CHAT_MESSAGE", isRead: false },
      });
      return NextResponse.json(
        { count: fallbackCount },
        { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=60" } }
      );
    }

    const chatIds = participants.map((p) => p.chatId);
    if (chatIds.length === 0) {
      return NextResponse.json(
        { count: 0 },
        { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=60" } }
      );
    }

    const latestByOthers = await prisma.chatMessage.groupBy({
      by: ["chatId"],
      where: {
        chatId: { in: chatIds },
        userId: { not: userId },
        isDeleted: { not: true },
      },
      _max: { createdAt: true },
    });

    const lastReadByChatId = new Map<string, Date | null>(
      participants.map((p) => [p.chatId, p.lastReadAt ?? null])
    );

    let count = 0;
    for (const row of latestByOthers) {
      const lastOther = row._max.createdAt ?? null;
      if (!lastOther) continue;
      const lastReadAt = lastReadByChatId.get(row.chatId) ?? null;
      if (!lastReadAt || lastOther > lastReadAt) count += 1;
    }

    return NextResponse.json(
      { count },
      { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=60" } }
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "unread-count 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}

