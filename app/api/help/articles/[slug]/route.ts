import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { helpArticlePublicWhere } from "@/lib/help-visibility";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

function isHelpAdmin(role: string | undefined) {
  return role === "ADMIN";
}

function slugOk(slug: string) {
  return /^[a-z0-9-]{1,128}$/.test(slug);
}

/** 단건: ?admin=1 이면 비공개·역할 제한 문서도 관리자만 조회 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const session = await getAppSession();
    const { slug: raw } = await params;
    const slug = decodeURIComponent(raw).trim();
    const admin = new URL(req.url).searchParams.get("admin") === "1";

    if (admin && !isHelpAdmin(session?.user?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const where = admin
      ? { slug }
      : { slug, ...helpArticlePublicWhere(session?.user?.role) };

    const row = await prisma.helpArticle.findFirst({ where });
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (e) {
    console.error("[help/articles/slug GET]", e);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const session = await getAppSession();
    if (!isHelpAdmin(session?.user?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { slug } = await params;
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const existing = await prisma.helpArticle.findUnique({ where: { slug } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: Prisma.HelpArticleUpdateInput = {};
    if (typeof body.title === "string") data.title = body.title.trim();
    if (typeof body.category === "string") data.category = body.category.trim();
    if (typeof body.summary === "string") data.summary = body.summary.trim();
    if (typeof body.bodyMd === "string") data.bodyMd = body.bodyMd;
    if (typeof body.orderIndex === "number" && Number.isFinite(body.orderIndex)) data.orderIndex = body.orderIndex;
    if (typeof body.isPublished === "boolean") data.isPublished = body.isPublished;
    if (Array.isArray(body.targetRoles)) {
      data.targetRoles = body.targetRoles.filter((x): x is string => typeof x === "string");
    }
    if (Array.isArray(body.relatedSlugs)) {
      data.relatedSlugs = body.relatedSlugs.filter((x): x is string => typeof x === "string" && slugOk(x));
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "변경할 필드가 없습니다." }, { status: 400 });
    }

    const updated = await prisma.helpArticle.update({
      where: { slug },
      data,
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error("[help/articles/slug PATCH]", e);
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const session = await getAppSession();
    if (!isHelpAdmin(session?.user?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { slug } = await params;
    await prisma.helpArticle.delete({ where: { slug } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[help/articles/slug DELETE]", e);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
