import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  userIds: z.array(z.string()).min(1),
  isGroup: z.boolean().optional(),
  name: z.string().optional(),
});

const userSelect = {
  id: true,
  name: true,
  position: true,
} as const;

export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";

    if (isAdmin) {
      const allChats = await prisma.chat.findMany({
        take: 80,
        include: {
          participants: {
            select: {
              id: true,
              chatId: true,
              userId: true,
              joinedAt: true,
              user: { select: userSelect },
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              body: true,
              createdAt: true,
              user: { select: userSelect },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      });
      const chats = allChats.map((chat: any) => ({
        id: chat.id,
        isGroup: chat.isGroup,
        name: chat.name,
        participants: chat.participants.map((x: any) => x.user),
        lastMessage: chat.messages[0] ?? null,
      }));
      return NextResponse.json(chats, {
        headers: {
          "Cache-Control": "private, no-cache, max-age=0, must-revalidate",
        },
      });
    }

    const participants = await prisma.chatParticipant.findMany({
      where: { userId: session.user.id },
      take: 80,
      include: {
        chat: {
          include: {
            participants: {
              select: {
                id: true,
                chatId: true,
                userId: true,
                joinedAt: true,
                user: { select: userSelect },
              },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                id: true,
                body: true,
                createdAt: true,
                user: { select: userSelect },
              },
            },
          },
        },
      },
      orderBy: { chat: { updatedAt: "desc" } },
    });

    const chats = participants.map((p: any) => ({
      id: p.chat.id,
      isGroup: p.chat.isGroup,
      name: p.chat.name,
      participants: p.chat.participants.map((x: any) => x.user),
      lastMessage: p.chat.messages[0] ?? null,
    }));

    return NextResponse.json(chats, {
      headers: {
        "Cache-Control": "private, no-cache, max-age=0, must-revalidate",
      },
    });
  } catch (e) {
    console.error("[GET /api/chats]", e);
    return NextResponse.json(
      { error: "채팅 목록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const userIds = [...new Set([session.user.id, ...parsed.data.userIds])];
    const isGroup = parsed.data.isGroup ?? userIds.length > 2;
    const name = parsed.data.name?.trim();

    // 계정이 없는 userId로는 채팅을 만들 수 없도록 검증
    const existingUsers = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    });
    if (existingUsers.length !== userIds.length) {
      return NextResponse.json(
        { error: "대화 상대 중 존재하지 않는 계정이 포함되어 있습니다." },
        { status: 400 }
      );
    }

    if (!isGroup && userIds.length === 2) {
      const [a, b] = userIds;
      const existing = await prisma.chat.findFirst({
        where: {
          isGroup: false,
          participants: {
            every: { userId: { in: [a, b] } },
          },
        },
        include: { participants: true },
      });
      if (existing && existing.participants.length === 2) {
        const ids = existing.participants.map((p: any) => p.userId).sort().join(",");
        if (ids === [a, b].sort().join(",")) {
          return NextResponse.json(existing);
        }
      }
    }

    const chat = await prisma.chat.create({
      data: {
        isGroup,
        name: isGroup ? name ?? null : null,
        participants: {
          create: userIds.map((userId: any) => ({ userId })),
        },
      },
      include: {
        participants: {
          include: { user: { select: userSelect } },
        },
      },
    });
    return NextResponse.json(chat);
  } catch (e) {
    console.error("[POST /api/chats]", e);
    return NextResponse.json(
      { error: "채팅을 만들 수 없습니다." },
      { status: 500 }
    );
  }
}
