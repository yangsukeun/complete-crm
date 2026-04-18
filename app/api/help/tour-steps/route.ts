import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

function isHelpAdmin(role: string | undefined) {
  return role === "ADMIN";
}

/** GET: ?tourKey=… 없으면 전체. POST: 관리자만 스텝 추가 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tourKey = searchParams.get("tourKey")?.trim() || undefined;

    const rows = await prisma.helpTourStep.findMany({
      where: tourKey ? { tourKey } : undefined,
      orderBy: [{ tourKey: "asc" }, { orderIndex: "asc" }],
    });
    return NextResponse.json(rows);
  } catch (e) {
    console.error("[help/tour-steps GET]", e);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAppSession();
    if (!isHelpAdmin(session?.user?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const tourKey = typeof body.tourKey === "string" ? body.tourKey.trim() : "";
    const orderIndex = typeof body.orderIndex === "number" && Number.isFinite(body.orderIndex) ? body.orderIndex : 0;
    const targetSelector = typeof body.targetSelector === "string" ? body.targetSelector.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const bodyMd = typeof body.bodyMd === "string" ? body.bodyMd : "";
    const placement = typeof body.placement === "string" ? body.placement.trim() || "bottom" : "bottom";
    const route = typeof body.route === "string" ? body.route.trim() || null : null;

    if (!tourKey || !targetSelector || !title) {
      return NextResponse.json({ error: "tourKey, targetSelector, title은 필수입니다." }, { status: 400 });
    }

    const created = await prisma.helpTourStep.create({
      data: { tourKey, orderIndex, targetSelector, title, bodyMd, placement, route },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    console.error("[help/tour-steps POST]", e);
    const msg = e instanceof Error && e.message.includes("Unique") ? "같은 tourKey·orderIndex가 이미 있습니다." : "생성 실패";
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
