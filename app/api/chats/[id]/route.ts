import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

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

