import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { helpArticlePublicWhere } from "@/lib/help-visibility";
import { categoryLabel } from "@/lib/help-categories";

export const runtime = "nodejs";

type Hit = { slug: string; title: string; summary: string; category: string };

/** GET ?q= — 최대 10건, 카테고리별 그룹 */
export async function GET(req: NextRequest) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    if (q.length < 1) {
      return NextResponse.json({ query: q, groups: [] as { category: string; label: string; items: Hit[] }[] });
    }

    const base = helpArticlePublicWhere(session.user.role);
    const rows = await prisma.helpArticle.findMany({
      where: {
        AND: [
          base,
          {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { summary: { contains: q, mode: "insensitive" } },
              { bodyMd: { contains: q, mode: "insensitive" } },
            ],
          },
        ],
      },
      orderBy: [{ category: "asc" }, { orderIndex: "asc" }, { title: "asc" }],
      take: 10,
      select: { slug: true, title: true, summary: true, category: true },
    });

    const groupMap = new Map<string, Hit[]>();
    for (const r of rows) {
      const list = groupMap.get(r.category) ?? [];
      list.push(r);
      groupMap.set(r.category, list);
    }

    const groups = Array.from(groupMap.entries()).map(([category, items]) => ({
      category,
      label: categoryLabel(category),
      items,
    }));

    return NextResponse.json({ query: q, groups });
  } catch (e) {
    console.error("[help/search GET]", e);
    return NextResponse.json({ error: "검색 실패" }, { status: 500 });
  }
}
