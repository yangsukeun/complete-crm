import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { isMasterSession } from "@/lib/master-account";

/**
 * 채팅방 참가자 목록 (확장/외부 클라이언트 호환: GET .../api/chats/employees/:chatId)
 */
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
    if (!chatId) {
      return NextResponse.json({ error: "Bad Request" }, { status: 400 });
    }

    const participant = await prisma.chatParticipant.findFirst({
      where: { chatId, userId: session.user.id },
      select: { id: true },
    });
    const isMaster = isMasterSession(session);
    if (!participant && !isMaster) {
      return NextResponse.json({ error: "채팅방에 접근할 수 없습니다." }, { status: 403 });
    }

    const rows = await prisma.chatParticipant.findMany({
      where: { chatId },
      select: {
        userId: true,
        joinedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            position: true,
            department: true,
            role: true,
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    return NextResponse.json({
      employees: rows.map((r) => ({
        id: r.user.id,
        userId: r.userId,
        name: r.user.name,
        email: r.user.email,
        position: r.user.position,
        department: r.user.department,
        role: r.user.role,
        joinedAt: r.joinedAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error("[GET /api/chats/employees/[id]]", e);
    return NextResponse.json(
      { error: "참가자 목록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}
