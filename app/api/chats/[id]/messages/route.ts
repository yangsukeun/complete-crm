import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { createNotificationWithOptions, markChatNotificationsRead } from "@/lib/notifications";
import { z } from "zod";

const postSchema = z.object({ body: z.string().min(1).max(2000) });

/** 마이그레이션 전 DB에 lastReadAt 없으면 Prisma 오류 — 메시지 API 전체 500 방지 */
function isMissingLastReadAtColumnError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    msg.includes("lastreadat") ||
    msg.includes("last_read_at") ||
    (msg.includes("unknown arg") && msg.includes("lastread")) ||
    (msg.includes("column") && msg.includes("does not exist") && msg.includes("lastread"))
  );
}

async function fetchReadAtByUserId(chatId: string): Promise<Record<string, string | null>> {
  try {
    const participants = await prisma.chatParticipant.findMany({
      where: { chatId },
      select: { userId: true, lastReadAt: true },
    });
    return Object.fromEntries(
      participants.map((p) => [p.userId, p.lastReadAt?.toISOString() ?? null])
    );
  } catch (e) {
    if (isMissingLastReadAtColumnError(e)) {
      console.warn(
        "[chat/messages] ChatParticipant.lastReadAt 컬럼 없음 — 읽음 표시 생략. `npx prisma db push` 또는 migrate deploy 권장."
      );
      return {};
    }
    throw e;
  }
}

/** 채팅을 읽음으로 처리할 때 해당 방의 CHAT_MESSAGE 알림을 서버에서도 읽음 처리 */
export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true } });
    if (!me) {
      return NextResponse.json({ error: "계정이 존재하지 않습니다." }, { status: 401 });
    }

    const { id: chatId } = await params;

    const participant = await prisma.chatParticipant.findFirst({
      where: { chatId, userId: session.user.id },
      select: { id: true },
    });
    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    if (!participant && !isAdmin) {
      return NextResponse.json({ error: "채팅방에 접근할 수 없습니다." }, { status: 403 });
    }

    const updated = await markChatNotificationsRead(session.user.id, chatId);
    try {
      await prisma.chatParticipant.updateMany({
        where: { chatId, userId: session.user.id },
        data: { lastReadAt: new Date() },
      });
    } catch (e) {
      if (!isMissingLastReadAtColumnError(e)) throw e;
      console.warn("[chat/messages PATCH] lastReadAt 갱신 생략(DB 컬럼 미적용)");
    }
    const readAtByUserId = await fetchReadAtByUserId(chatId);
    return NextResponse.json({ ok: true, markedRead: updated, readAtByUserId });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "읽음 처리에 실패했습니다." }, { status: 500 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true } });
    if (!me) {
      return NextResponse.json({ error: "계정이 존재하지 않습니다." }, { status: 401 });
    }

    const { id: chatId } = await params;

    const participant = await prisma.chatParticipant.findFirst({
      where: { chatId, userId: session.user.id },
      select: { id: true },
    });
    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    if (!participant && !isAdmin) {
      return NextResponse.json({ error: "채팅방에 접근할 수 없습니다." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 200);
    const afterId = searchParams.get("after");
    const sinceIso = searchParams.get("since");
    const readMetaOnly = searchParams.get("readMeta") === "1";

    if (readMetaOnly) {
      const readAtByUserId = await fetchReadAtByUserId(chatId);
      return NextResponse.json({ messages: [], readAtByUserId });
    }

    const messageUserSelect = { id: true, name: true, position: true };
    // createdAt 기준 증분 (cuid 정렬 after= 보다 안전)
    if (sinceIso) {
      const sinceDate = new Date(sinceIso);
      if (!Number.isNaN(sinceDate.getTime())) {
        const newMessages = await prisma.chatMessage.findMany({
          where: { chatId, createdAt: { gt: sinceDate } },
          include: { user: { select: messageUserSelect } },
          orderBy: { createdAt: "asc" },
          take: 50,
        });
        const readAtByUserId = await fetchReadAtByUserId(chatId);
        return NextResponse.json({ messages: newMessages, readAtByUserId });
      }
    }
    if (afterId) {
      const newMessages = await prisma.chatMessage.findMany({
        where: { chatId, id: { gt: afterId } },
        include: { user: { select: messageUserSelect } },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      const readAtByUserId = await fetchReadAtByUserId(chatId);
      return NextResponse.json({ messages: newMessages, readAtByUserId });
    }

    // 초기/이전 로드: 최근 limit개만 조회 (목록용으로 user는 id/name/position만)
    const messages = await prisma.chatMessage.findMany({
      where: { chatId },
      include: { user: { select: messageUserSelect } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    messages.reverse();
    const readAtByUserId = await fetchReadAtByUserId(chatId);
    return NextResponse.json({ messages, readAtByUserId });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "메시지를 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true } });
    if (!me) {
      return NextResponse.json({ error: "계정이 존재하지 않습니다." }, { status: 401 });
    }

    const { id: chatId } = await params;

    const participant = await prisma.chatParticipant.findFirst({
      where: { chatId, userId: session.user.id },
      select: { id: true },
    });
    if (!participant) {
      return NextResponse.json({ error: "채팅방에 접근할 수 없습니다." }, { status: 403 });
    }

    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "메시지 내용을 입력하세요." },
        { status: 400 }
      );
    }

    const [message] = await prisma.$transaction([
      prisma.chatMessage.create({
        data: {
          chatId,
          userId: session.user.id,
          body: parsed.data.body.trim(),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              position: true,
              currentProject: { select: { name: true, brand: { select: { name: true } } } },
            },
          },
        },
      }),
      prisma.chat.update({
        where: { id: chatId },
        data: { updatedAt: new Date() },
      }),
    ]);

    const senderName = session.user.name ?? "누군가";
    const participants = await prisma.chatParticipant.findMany({
      where: { chatId, userId: { not: session.user.id } },
      select: { userId: true },
    });
    console.log("[chat/messages POST] 수신자에게 알림+푸시 트리거", {
      chatId,
      recipientCount: participants.length,
      senderId: session.user.id,
    });
    for (const p of participants) {
      await createNotificationWithOptions({
        userId: p.userId,
        type: "CHAT_MESSAGE",
        message: `${senderName}님이 채팅 메시지를 보냈습니다.`,
        link: `/chat/${chatId}`,
        actorId: session.user.id,
      });
    }

    return NextResponse.json(message);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "메시지 전송에 실패했습니다." },
      { status: 500 }
    );
  }
}
