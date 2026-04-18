import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

/** GET: 내 투어 진행 (?tourKey= 단일 또는 전체) */
export async function GET(req: NextRequest) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tourKey = new URL(req.url).searchParams.get("tourKey")?.trim() || undefined;

    const rows = await prisma.userTourProgress.findMany({
      where: { userId: session.user.id, ...(tourKey ? { tourKey } : {}) },
      orderBy: { tourKey: "asc" },
    });
    return NextResponse.json(rows);
  } catch (e) {
    console.error("[help/tour-progress GET]", e);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}

/** POST: { tourKey, action: 'complete' | 'skip' } */
export async function POST(req: NextRequest) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const tourKey = typeof body.tourKey === "string" ? body.tourKey.trim() : "";
    const action =
      body.action === "complete" || body.action === "skip" || body.action === "reset"
        ? body.action
        : null;
    if (!tourKey || !action) {
      return NextResponse.json({ error: "tourKey와 action(complete|skip|reset)이 필요합니다." }, { status: 400 });
    }

    if (action === "reset") {
      await prisma.userTourProgress.deleteMany({
        where: { userId: session.user.id, tourKey },
      });
      return NextResponse.json({ ok: true, reset: true });
    }

    const now = new Date();
    const row = await prisma.userTourProgress.upsert({
      where: { userId_tourKey: { userId: session.user.id, tourKey } },
      create: {
        userId: session.user.id,
        tourKey,
        completedAt: action === "complete" ? now : null,
        skippedAt: action === "skip" ? now : null,
      },
      update:
        action === "complete"
          ? { completedAt: now, skippedAt: null }
          : { skippedAt: now, completedAt: null },
    });

    return NextResponse.json(row);
  } catch (e) {
    console.error("[help/tour-progress POST]", e);
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }
}
