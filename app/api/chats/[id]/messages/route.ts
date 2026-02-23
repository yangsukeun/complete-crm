import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const postSchema = z.object({ body: z.string().min(1).max(2000) });

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
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
      orderBy: { createdAt: "asc" },
    });

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
    const session = await auth();
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

    return NextResponse.json(message);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "메시지 전송에 실패했습니다." },
      { status: 500 }
    );
  }
}
