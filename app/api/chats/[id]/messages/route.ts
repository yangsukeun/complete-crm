import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { createNotificationWithOptions, markChatNotificationsRead } from "@/lib/notifications";
import { isMasterSession } from "@/lib/master-account";
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

    const { id: chatId } = await params;

    const participant = await prisma.chatParticipant.findFirst({
      where: { chatId, userId: session.user.id },
      select: { id: true },
    });
    const isMaster = isMasterSession(session);
    if (!participant && !isMaster) {
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

    const { id: chatId } = await params;

    const participant = await prisma.chatParticipant.findFirst({
      where: { chatId, userId: session.user.id },
      select: { id: true },
    });
    const isMaster = isMasterSession(session);
    if (!participant && !isMaster) {
      return NextResponse.json({ error: "채팅방에 접근할 수 없습니다." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    // [PERF-2차] 초기 로드 기본 50건 — 스크롤 업·since 로 확장
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);
    const afterId = searchParams.get("after");
    const sinceIso = searchParams.get("since");
    const readMetaOnly = searchParams.get("readMeta") === "1";
    /** 방 열 때 읽음·알림 처리까지 한 번에 (기존 PATCH와 동일, 왕복 1회 절약) */
    const markRead = searchParams.get("markRead") === "1" && !!participant;

    if (readMetaOnly) {
      const readAtByUserId = await fetchReadAtByUserId(chatId);
      return NextResponse.json({ messages: [], readAtByUserId });
    }

    const messageUserSelect = { id: true, name: true, position: true };

    const runMarkRead = async () => {
      if (!markRead) return;
      try {
        await markChatNotificationsRead(session.user.id, chatId);
        await prisma.chatParticipant.updateMany({
          where: { chatId, userId: session.user.id },
          data: { lastReadAt: new Date() },
        });
      } catch (e) {
        if (!isMissingLastReadAtColumnError(e)) throw e;
        console.warn("[chat/messages GET markRead] lastReadAt 갱신 생략(DB 컬럼 미적용)");
      }
    };

    // createdAt 기준 증분 (cuid 정렬 after= 보다 안전)
    if (sinceIso) {
      const sinceDate = new Date(sinceIso);
      if (!Number.isNaN(sinceDate.getTime())) {
        const [newMessages, readAtByUserId] = await Promise.all([
          prisma.chatMessage.findMany({
            /* gt만 쓰면 동일 createdAt(ms)의 연속 메시지가 누락될 수 있어 gte + 클라이언트 id 중복 제거 */
            where: { chatId, createdAt: { gte: sinceDate } },
            select: {
              id: true,
              body: true,
              createdAt: true,
              isDeleted: true,
              userId: true,
              user: { select: messageUserSelect },
            },
            orderBy: { createdAt: "asc" },
            take: 50,
          }),
          fetchReadAtByUserId(chatId),
        ]);
        await runMarkRead();
        return NextResponse.json({ messages: newMessages, readAtByUserId });
      }
    }
    if (afterId) {
      const [newMessages, readAtByUserId] = await Promise.all([
        prisma.chatMessage.findMany({
          where: { chatId, id: { gt: afterId } },
          select: {
            id: true,
            body: true,
            createdAt: true,
            isDeleted: true,
            userId: true,
            user: { select: messageUserSelect },
          },
          orderBy: { createdAt: "asc" },
          take: 50,
        }),
        fetchReadAtByUserId(chatId),
      ]);
      await runMarkRead();
      return NextResponse.json({ messages: newMessages, readAtByUserId });
    }

    const [messages, readAtByUserId] = await Promise.all([
      (async () => {
        const list = await prisma.chatMessage.findMany({
          where: { chatId },
          select: {
            id: true,
            body: true,
            createdAt: true,
            isDeleted: true,
            userId: true,
            user: { select: messageUserSelect },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        });
        list.reverse();
        return list;
      })(),
      fetchReadAtByUserId(chatId),
    ]);
    await runMarkRead();
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
