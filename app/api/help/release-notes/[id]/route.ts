import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

function isHelpAdmin(role: string | undefined) {
  return role === "ADMIN";
}

const NOTE_CATEGORIES = new Set(["feature", "fix", "breaking"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAppSession();
    if (!isHelpAdmin(session?.user?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const existing = await prisma.releaseNote.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: Prisma.ReleaseNoteUpdateInput = {};
    if (typeof body.version === "string") data.version = body.version.trim();
    if (typeof body.title === "string") data.title = body.title.trim();
    if (typeof body.bodyMd === "string") data.bodyMd = body.bodyMd;
    if (typeof body.category === "string") {
      const c = body.category.trim();
      if (!NOTE_CATEGORIES.has(c)) {
        return NextResponse.json({ error: "category는 feature|fix|breaking 만 허용" }, { status: 400 });
      }
      data.category = c;
    }
    if (typeof body.releasedAt === "string") {
      const d = new Date(body.releasedAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "releasedAt 오류" }, { status: 400 });
      }
      data.releasedAt = d;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "변경할 필드 없음" }, { status: 400 });
    }

    const updated = await prisma.releaseNote.update({
      where: { id },
      data,
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error("[help/release-notes/id PATCH]", e);
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAppSession();
    if (!isHelpAdmin(session?.user?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    await prisma.releaseNote.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[help/release-notes/id DELETE]", e);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
