import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: chatId } = await params;
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        id: true,
        isGroup: true,
        name: true,
        participants: {
          select: { user: { select: { id: true, name: true, position: true } } },
        },
      },
    });
    if (!chat) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      id: chat.id,
      isGroup: chat.isGroup,
      name: chat.name,
      participants: chat.participants.map((p: { user: { id: string; name: string; position: string | null } }) => p.user),
    });
  } catch (e) {
    console.error("[GET /api/chats/[id]]", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

/**
 * 외부/확장 CRM 연동 등에서 빈 POST로 방 상태 동기화 시 — 임원·관리자는 비참여 방이면 참가만 추가.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: chatId } = await params;
    if (!chatId) {
      return NextResponse.json({ error: "Bad Request" }, { status: 400 });
    }

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { id: true },
    });
    if (!chat) {
      return NextResponse.json({ error: "채팅방을 찾을 수 없습니다." }, { status: 404 });
    }

    const isAdmin =
      session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";

    const existing = await prisma.chatParticipant.findFirst({
      where: { chatId, userId: session.user.id },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ ok: true, alreadyMember: true });
    }

    if (isAdmin) {
      await prisma.chatParticipant.create({
        data: { chatId, userId: session.user.id },
      });
      return NextResponse.json({ ok: true, joined: true });
    }

    return NextResponse.json(
      { error: "참여 중인 채팅만 동기화할 수 있습니다." },
      { status: 403 }
    );
  } catch (e) {
    console.error("[POST /api/chats/[id]]", e);
    return NextResponse.json({ error: "동기화에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: chatId } = await params;
    if (!chatId) {
      return NextResponse.json({ error: "Bad Request" }, { status: 400 });
    }

    const isAdmin =
      session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";

    const participant = await prisma.chatParticipant.findFirst({
      where: { chatId, userId: session.user.id },
      select: { id: true },
    });

    if (!participant && !isAdmin) {
      return NextResponse.json(
        { error: "채팅방에 참여 중인 사용자만 나갈 수 있습니다." },
        { status: 403 }
      );
    }

    if (participant) {
      await prisma.chatParticipant.delete({ where: { id: participant.id } });
    }

    const remainCount = await prisma.chatParticipant.count({
      where: { chatId },
    });
    if (remainCount === 0) {
      await prisma.chat.delete({ where: { id: chatId } });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DELETE /api/chats/[id]]", e);
    return NextResponse.json(
      { error: "채팅방에서 나갈 수 없습니다." },
      { status: 500 }
    );
  }
}

