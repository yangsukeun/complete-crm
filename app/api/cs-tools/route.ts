import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { sortCsToolCategories } from "@/lib/cs-tools";

export const runtime = "nodejs";

/** GET /api/cs-tools — 활성 도구 목록 (order 순) + category 그룹 */
export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const tools = await prisma.csTool.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        url: true,
        category: true,
        description: true,
        clickCount: true,
        order: true,
      },
    });

    const byCategory: Record<string, typeof tools> = {};
    for (const t of tools) {
      const key = t.category || "기타";
      if (!byCategory[key]) byCategory[key] = [];
      byCategory[key].push(t);
    }

    const categories = sortCsToolCategories(Object.keys(byCategory));

    return NextResponse.json({
      tools,
      categories,
      byCategory,
      total: tools.length,
    });
  } catch (e) {
    console.error("[cs-tools GET]", e);
    return NextResponse.json({ error: "목록을 불러오지 못했습니다." }, { status: 500 });
  }
}
