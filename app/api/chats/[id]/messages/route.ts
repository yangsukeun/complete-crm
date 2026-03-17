import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { createNotificationWithOptions } from "@/lib/notifications";
import { z } from "zod";

const postSchema = z.object({ body: z.string().min(1).max(2000) });

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
    });
    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    if (!participant && !isAdmin) {
      return NextResponse.json({ error: "채팅방에 접근할 수 없습니다." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 200);
    const afterId = searchParams.get("after");

    // 폴링: afterId 있으면 해당 id 이후 메시지만 조회 (새 메시지만 가져와서 빠름)
    if (afterId) {
      const newMessages = await prisma.chatMessage.findMany({
        where: { chatId, id: { gt: afterId } },
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
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      return NextResponse.json(newMessages);
    }

    // 초기/이전 로드: 최근 limit개만 조회
    const messages = await prisma.chatMessage.findMany({
      where: { chatId },
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
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    messages.reverse();
    return NextResponse.json(messages);
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
        link: `/chats/${chatId}`,
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
