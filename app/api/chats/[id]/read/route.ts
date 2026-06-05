import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { markChatNotificationsRead } from "@/lib/notifications";
import { isMasterSession } from "@/lib/master-account";

/** 마이그레이션 전 DB에 lastReadAt 없으면 Prisma 오류 — 라우트 전체 500 방지 */
function isMissingLastReadAtColumnError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    msg.includes("lastreadat") ||
    msg.includes("last_read_at") ||
    (msg.includes("unknown arg") && msg.includes("lastread")) ||
    (msg.includes("column") && msg.includes("does not exist") && msg.includes("lastread"))
  );
}

export async function POST(
  _req: Request,
  context: { params: Promise<unknown> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const p = (await context.params) as { id?: unknown };
    const chatId = typeof p?.id === "string" ? p.id : "";
    if (!chatId) {
      return NextResponse.json({ error: "Invalid chat id" }, { status: 400 });
    }
    const userId = session.user.id;

    const participant = await prisma.chatParticipant.findFirst({
      where: { chatId, userId },
      select: { id: true },
    });
    const isMaster = isMasterSession(session);
    if (!participant && !isMaster) {
      return NextResponse.json({ error: "채팅방에 접근할 수 없습니다." }, { status: 403 });
    }

    const marked = await markChatNotificationsRead(userId, chatId);
    try {
      await prisma.chatParticipant.updateMany({
        where: { chatId, userId },
        data: { lastReadAt: new Date() },
      });
    } catch (e) {
      if (!isMissingLastReadAtColumnError(e)) throw e;
    }

    return NextResponse.json({ ok: true, markedRead: marked });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "읽음 처리에 실패했습니다." },
      { status: 500 }
    );
  }
}

