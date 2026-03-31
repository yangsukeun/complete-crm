import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const bodySchema = z.object({
  chatIds: z.array(z.string().min(1)).max(80),
});

function isMissingLastReadAtColumnError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    msg.includes("lastreadat") ||
    msg.includes("last_read_at") ||
    (msg.includes("unknown arg") && msg.includes("lastread")) ||
    (msg.includes("column") && msg.includes("does not exist") && msg.includes("lastread"))
  );
}

/** 로컬에서 이미 읽은 방만 DB lastReadAt·알림을 한 번에 맞춤 (방마다 쿼리 반복 없음) */
export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { chatIds } = parsed.data;
    const userId = session.user.id;
    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";

    const participantRows = await prisma.chatParticipant.findMany({
      where: { userId, chatId: { in: chatIds } },
      select: { chatId: true },
    });
    const participantChatIds = [...new Set(participantRows.map((r) => r.chatId))];

    const notifyChatIds = isAdmin ? [...new Set(chatIds)] : participantChatIds;
    const links = notifyChatIds.flatMap((id) => [`/chat/${id}`, `/chats/${id}`]);

    if (links.length > 0) {
      await prisma.notification.updateMany({
        where: {
          userId,
          type: "CHAT_MESSAGE",
          isRead: false,
          link: { in: links },
        },
        data: { isRead: true },
      });
    }

    if (participantChatIds.length > 0) {
      try {
        await prisma.chatParticipant.updateMany({
          where: { userId, chatId: { in: participantChatIds } },
          data: { lastReadAt: new Date() },
        });
      } catch (e) {
        if (!isMissingLastReadAtColumnError(e)) throw e;
      }
    }

    const synced = isAdmin ? chatIds.length : participantChatIds.length;
    return NextResponse.json({ ok: true, synced });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "읽음 동기화에 실패했습니다." }, { status: 500 });
  }
}
