import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { boardVisibilityWhere } from "@/lib/board-access";

export const runtime = "nodejs";

/**
 * GET ?since=ISO — 해당 시각 이후 생성된 자료실 글 수(삭제 제외, 목록과 동일한 가시성).
 */
export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ count: 0 }, { status: 200 });
    }

    let since: Date;
    try {
      const u = new URL(req.url);
      const raw = u.searchParams.get("since")?.trim() ?? "";
      since = new Date(raw);
      if (Number.isNaN(since.getTime())) {
        return NextResponse.json({ count: 0 }, { status: 200 });
      }
    } catch {
      return NextResponse.json({ count: 0 }, { status: 200 });
    }

    const role = (session.user as { role?: string }).role ?? "";
    const vis = boardVisibilityWhere(session.user.id, role);
    const where = { AND: [vis, { createdAt: { gt: since } }] };

    const count = await prisma.boardPost.count({ where });

    return NextResponse.json(
      { count },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  } catch (e) {
    console.error("[board/new-count]", e);
    return NextResponse.json({ count: 0 }, { status: 200 });
  }
}
