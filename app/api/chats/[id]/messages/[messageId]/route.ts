import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

const DELETE_ALLOWED_SECONDS = 600; // 10분

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: chatId, messageId } = await params;

    const participant = await prisma.chatParticipant.findFirst({
      where: { chatId, userId: session.user.id },
    });
    const role = (session.user as { role?: string }).role;
    const isAdmin = role === "EXECUTIVE" || role === "ADMIN";
    if (!participant && !isAdmin) {
      return NextResponse.json({ error: "채팅방에 접근할 수 없습니다." }, { status: 403 });
    }

    const message = await prisma.chatMessage.findFirst({
      where: { id: messageId, chatId },
    });
    if (!message) {
      return NextResponse.json({ error: "메시지를 찾을 수 없습니다." }, { status: 404 });
    }

    if (message.userId !== session.user.id) {
      return NextResponse.json({ error: "본인이 보낸 메시지만 삭제할 수 있습니다." }, { status: 403 });
    }

    if (message.isDeleted) {
      return NextResponse.json({ error: "이미 삭제된 메시지입니다." }, { status: 400 });
    }

    const now = new Date();
    const createdAt = new Date(message.createdAt);
    const elapsedSeconds = (now.getTime() - createdAt.getTime()) / 1000;
    if (elapsedSeconds > DELETE_ALLOWED_SECONDS) {
      return NextResponse.json(
        { error: "10분이 경과하여 삭제할 수 없습니다." },
        { status: 400 }
      );
    }

    await prisma.chatMessage.update({
      where: { id: messageId },
      data: { isDeleted: true },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DELETE message]", e);
    return NextResponse.json(
      { error: "메시지 삭제에 실패했습니다." },
      { status: 500 }
    );
  }
}
