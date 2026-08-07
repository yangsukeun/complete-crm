import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/cs-tools/[id]/click — clickCount +1, 본인 클릭 로그 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { id } = await ctx.params;
    const toolId = id?.trim();
    if (!toolId) {
      return NextResponse.json({ error: "도구 ID가 필요합니다." }, { status: 400 });
    }

    const tool = await prisma.csTool.findFirst({
      where: { id: toolId, isActive: true },
      select: { id: true },
    });
    if (!tool) {
      return NextResponse.json({ error: "도구를 찾을 수 없습니다." }, { status: 404 });
    }

    const [updated] = await prisma.$transaction([
      prisma.csTool.update({
        where: { id: tool.id },
        data: { clickCount: { increment: 1 } },
        select: { id: true, clickCount: true },
      }),
      prisma.csToolClickLog.create({
        data: {
          toolId: tool.id,
          userId: session.user.id,
        },
      }),
    ]);

    return NextResponse.json({ ok: true, id: updated.id, clickCount: updated.clickCount });
  } catch (e) {
    console.error("[cs-tools click POST]", e);
    return NextResponse.json({ error: "클릭 기록에 실패했습니다." }, { status: 500 });
  }
}
