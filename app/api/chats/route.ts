import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  userIds: z.array(z.string()).min(1),
  isGroup: z.boolean().optional(),
  name: z.string().optional(),
});

const userSelectWithProject = {
  id: true,
  name: true,
  position: true,
  currentProject: { select: { name: true, brand: { select: { name: true } } } },
} as const;
const userSelectFallback = { id: true, name: true, position: true } as const;

function withCurrentProjectNull<T extends { id: string; name: string; position: string | null }>(
  u: T
): T & { currentProject: { name: string; brand: { name: string } } | null } {
  return { ...u, currentProject: null };
}

export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true } });
    if (!me) {
      return NextResponse.json({ error: "계정이 존재하지 않습니다." }, { status: 401 });
    }

    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";

    if (isAdmin) {
      let allChats: Awaited<
        ReturnType<
          typeof prisma.chat.findMany<{
            include: {
              participants: { include: { user: { select: typeof userSelectWithProject } } };
              messages: { include: { user: { select: typeof userSelectWithProject } } };
            };
          }>
        >
      >;
      try {
        allChats = await prisma.chat.findMany({
          include: {
            participants: {
              include: { user: { select: userSelectWithProject } },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: { user: { select: userSelectWithProject } },
            },
          },
          orderBy: { updatedAt: "desc" },
        });
      } catch {
        const raw = await prisma.chat.findMany({
          include: {
            participants: {
              include: { user: { select: userSelectFallback } },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: { user: { select: userSelectFallback } },
            },
          },
          orderBy: { updatedAt: "desc" },
        });
        const chats = raw.map((chat: any) => ({
          id: chat.id,
          isGroup: chat.isGroup,
          name: chat.name,
          participants: chat.participants.map((x: any) => withCurrentProjectNull(x.user)),
          lastMessage: chat.messages[0]
            ? { ...chat.messages[0], user: withCurrentProjectNull(chat.messages[0].user) }
            : null,
        }));
        return NextResponse.json(chats);
      }
      const chats = allChats.map((chat: any) => ({
        id: chat.id,
        isGroup: chat.isGroup,
        name: chat.name,
        participants: chat.participants.map((x: any) => x.user),
        lastMessage: chat.messages[0] ?? null,
      }));
      return NextResponse.json(chats);
    }

    let participants: Awaited<
      ReturnType<
        typeof prisma.chatParticipant.findMany<{
          include: {
            chat: {
              include: {
                participants: { include: { user: { select: typeof userSelectWithProject } } };
                messages: { include: { user: { select: typeof userSelectWithProject } } };
              };
            };
          };
        }>
      >
    >;
    try {
      participants = await prisma.chatParticipant.findMany({
        where: { userId: session.user.id },
        include: {
          chat: {
            include: {
              participants: {
                include: { user: { select: userSelectWithProject } },
              },
              messages: {
                orderBy: { createdAt: "desc" },
                take: 1,
                include: { user: { select: userSelectWithProject } },
              },
            },
          },
        },
        orderBy: { chat: { updatedAt: "desc" } },
      });
    } catch {
      const raw = await prisma.chatParticipant.findMany({
        where: { userId: session.user.id },
        include: {
          chat: {
            include: {
              participants: {
                include: { user: { select: userSelectFallback } },
              },
              messages: {
                orderBy: { createdAt: "desc" },
                take: 1,
                include: { user: { select: userSelectFallback } },
              },
            },
          },
        },
        orderBy: { chat: { updatedAt: "desc" } },
      });
      const chats = raw.map((p: any) => ({
        id: p.chat.id,
        isGroup: p.chat.isGroup,
        name: p.chat.name,
        participants: p.chat.participants.map((x: any) => withCurrentProjectNull(x.user)),
        lastMessage: p.chat.messages[0]
          ? { ...p.chat.messages[0], user: withCurrentProjectNull(p.chat.messages[0].user) }
          : null,
      }));
      return NextResponse.json(chats);
    }

    const chats = participants.map((p: any) => ({
      id: p.chat.id,
      isGroup: p.chat.isGroup,
      name: p.chat.name,
      participants: p.chat.participants.map((x: any) => x.user),
      lastMessage: p.chat.messages[0] ?? null,
    }));

    return NextResponse.json(chats);
  } catch (e) {
    console.error(e);
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

    const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true } });
    if (!me) {
      return NextResponse.json({ error: "계정이 존재하지 않습니다." }, { status: 401 });
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

    try {
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
            include: { user: { select: userSelectWithProject } },
          },
        },
      });
      return NextResponse.json(chat);
    } catch {
      const created = await prisma.chat.create({
        data: {
          isGroup,
          name: isGroup ? name ?? null : null,
          participants: {
            create: userIds.map((userId: any) => ({ userId })),
          },
        },
        include: {
          participants: {
            include: { user: { select: userSelectFallback } },
          },
        },
      });
      return NextResponse.json({
        ...created,
        participants: created.participants.map((p: any) => ({
          ...p,
          user: withCurrentProjectNull(p.user),
        })),
      });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "채팅을 만들 수 없습니다." },
      { status: 500 }
    );
  }
}
