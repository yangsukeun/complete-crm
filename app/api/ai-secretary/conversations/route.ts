import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

/** 날짜별 대화 목록 (최신순) */
export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const rows = await prisma.aiConversation.findMany({
      where: { userId: session.user.id },
      orderBy: { dateKey: "desc" },
      select: {
        id: true,
        dateKey: true,
        updatedAt: true,
        messages: {
          orderBy: { orderIndex: "desc" },
          take: 1,
          select: { content: true, role: true },
        },
      },
    });

    const list = rows.map((r) => ({
      id: r.id,
      dateKey: r.dateKey,
      updatedAt: r.updatedAt.toISOString(),
      preview: r.messages[0]?.content?.slice(0, 120) ?? "",
    }));

    return NextResponse.json({ conversations: list });
  } catch (e) {
    console.error("[ai-secretary/conversations]", e);
    return NextResponse.json({ error: "목록을 불러오지 못했습니다." }, { status: 500 });
  }
}
