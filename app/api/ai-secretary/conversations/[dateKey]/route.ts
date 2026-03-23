import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

/** 날짜별 메시지는 항상 최신 DB 기준 (GET 캐시 방지) */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(
  _req: Request,
  context: { params: Promise<{ dateKey: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const params = await context.params;
    const rawKey = params?.dateKey ?? "";
    const decoded = decodeURIComponent(rawKey);
    if (!DATE_RE.test(decoded)) {
      return NextResponse.json({ error: "날짜 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const conv = await prisma.aiConversation.findUnique({
      where: {
        userId_dateKey: { userId: session.user.id, dateKey: decoded },
      },
      include: {
        messages: {
          orderBy: { orderIndex: "asc" },
          select: {
            id: true,
            role: true,
            content: true,
            createdAt: true,
            orderIndex: true,
          },
        },
      },
    });

    if (!conv) {
      return NextResponse.json({ conversation: null, messages: [] });
    }

    return NextResponse.json({
      conversation: { id: conv.id, dateKey: conv.dateKey },
      messages: conv.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error("[ai-secretary/conversations/dateKey]", e);
    return NextResponse.json({ error: "대화를 불러오지 못했습니다." }, { status: 500 });
  }
}
