import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { helpArticlePublicWhere } from "@/lib/help-visibility";

export const runtime = "nodejs";

function isHelpAdmin(role: string | undefined) {
  return role === "ADMIN";
}

function slugOk(slug: string) {
  return /^[a-z0-9-]{1,128}$/.test(slug);
}

/** 목록: ?category=…&all=1(관리자 전체) */
export async function GET(req: NextRequest) {
  try {
    const session = await getAppSession();
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category")?.trim() || undefined;
    const all = searchParams.get("all") === "1";
    const q = searchParams.get("q")?.trim() || undefined;

    if (all && !isHelpAdmin(session?.user?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const base = all
      ? category
        ? { category }
        : {}
      : {
          ...helpArticlePublicWhere(session?.user?.role),
          ...(category ? { category } : {}),
        };

    const where =
      q && q.length > 0
        ? {
            AND: [
              base,
              {
                OR: [
                  { title: { contains: q, mode: "insensitive" as const } },
                  { summary: { contains: q, mode: "insensitive" as const } },
                ],
              },
            ],
          }
        : base;

    const rows = await prisma.helpArticle.findMany({
      where,
      orderBy: [{ category: "asc" }, { orderIndex: "asc" }, { title: "asc" }],
      select: {
        id: true,
        slug: true,
        title: true,
        category: true,
        summary: true,
        orderIndex: true,
        isPublished: true,
        targetRoles: true,
        relatedSlugs: true,
        updatedAt: true,
        ...(all ? { bodyMd: true } : {}),
      },
    });

    return NextResponse.json(rows);
  } catch (e) {
    console.error("[help/articles GET]", e);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}

/** 신규 문서 (관리자만) */
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

    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    if (!slugOk(slug)) {
      return NextResponse.json({ error: "slug은 소문자·숫자·하이픈만 허용됩니다." }, { status: 400 });
    }

    const dup = await prisma.helpArticle.findUnique({ where: { slug }, select: { id: true } });
    if (dup) {
      return NextResponse.json({ error: "이미 존재하는 slug입니다." }, { status: 409 });
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const category = typeof body.category === "string" ? body.category.trim() : "getting-started";
    const summary = typeof body.summary === "string" ? body.summary.trim() : "";
    const bodyMd = typeof body.bodyMd === "string" ? body.bodyMd : "";
    const orderIndex = typeof body.orderIndex === "number" && Number.isFinite(body.orderIndex) ? body.orderIndex : 0;
    const isPublished = typeof body.isPublished === "boolean" ? body.isPublished : true;
    const targetRoles = Array.isArray(body.targetRoles)
      ? body.targetRoles.filter((x): x is string => typeof x === "string")
      : [];
    const relatedSlugs = Array.isArray(body.relatedSlugs)
      ? body.relatedSlugs.filter((x): x is string => typeof x === "string" && slugOk(x))
      : [];

    if (!title) {
      return NextResponse.json({ error: "title은 필수입니다." }, { status: 400 });
    }

    const created = await prisma.helpArticle.create({
      data: {
        slug,
        title,
        category,
        summary: summary || title,
        bodyMd,
        orderIndex,
        isPublished,
        targetRoles,
        relatedSlugs,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    console.error("[help/articles POST]", e);
    return NextResponse.json({ error: "생성 실패" }, { status: 500 });
  }
}
