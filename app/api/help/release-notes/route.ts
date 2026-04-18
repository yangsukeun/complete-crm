import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

function isHelpAdmin(role: string | undefined) {
  return role === "ADMIN";
}

const NOTE_CATEGORIES = new Set(["feature", "fix", "breaking"]);

export async function GET() {
  try {
    const rows = await prisma.releaseNote.findMany({
      orderBy: { releasedAt: "desc" },
      take: 100,
    });
    return NextResponse.json(rows);
  } catch (e) {
    console.error("[help/release-notes GET]", e);
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

    const version = typeof body.version === "string" ? body.version.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const bodyMd = typeof body.bodyMd === "string" ? body.bodyMd : "";
    const category = typeof body.category === "string" ? body.category.trim() : "";
    const releasedAtRaw = typeof body.releasedAt === "string" ? body.releasedAt : "";
    const releasedAt = releasedAtRaw ? new Date(releasedAtRaw) : new Date();

    if (!version || !title || !NOTE_CATEGORIES.has(category)) {
      return NextResponse.json(
        { error: "version, title, category(feature|fix|breaking)이 필요합니다." },
        { status: 400 }
      );
    }
    if (Number.isNaN(releasedAt.getTime())) {
      return NextResponse.json({ error: "releasedAt이 올바른 날짜가 아닙니다." }, { status: 400 });
    }

    const created = await prisma.releaseNote.create({
      data: { version, title, bodyMd, category, releasedAt },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    console.error("[help/release-notes POST]", e);
    return NextResponse.json({ error: "생성 실패" }, { status: 500 });
  }
}
