import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { boardVisibilityWhere } from "@/lib/board-access";
import { boardCategoryIsAnonymous, isBoardCategory } from "@/lib/board-category";
import { z } from "zod";
import { normalizeBoardDescriptionForStore } from "@/lib/board-body";

export const runtime = "nodejs";
/** Drive 업로드·DB 지연 대비 (Vercel Pro 등에서 상한 상향 시 반영) */
export const maxDuration = 60;

const categorySchema = z.enum(["COMPANY", "TRAINING", "FREE", "ANONYMOUS"]);

function safeParseAttachments(raw: string | null | undefined): { url: string; name: string }[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is { url?: string; name?: string } => x != null && typeof x === "object")
      .map((x) => ({
        url: typeof x.url === "string" ? x.url : "",
        name: typeof x.name === "string" ? x.name : "파일",
      }))
      .filter((x) => x.url.length > 0);
  } catch {
    return [];
  }
}

const workspaceScopeSchema = z.enum(["TEAM", "PERSONAL"]);

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.preprocess(
    (v) => (typeof v === "string" ? v : ""),
    z.string().max(50000)
  ),
  contentType: z.enum(["text", "html"]).optional().default("text"),
  category: categorySchema,
  workspaceScope: workspaceScopeSchema.optional().default("TEAM"),
  attachments: z.preprocess(
    (v) => (Array.isArray(v) ? v : []),
    z
      .array(
        z.object({
          url: z.string().min(1),
          name: z.string().optional(),
        })
      )
      .max(20)
  ),
});

function emptyBoardListResponse(
  searchParams: URLSearchParams,
  listCacheHeaders: Record<string, string>
) {
  const limit = Math.min(20, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));
  const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);
  const all = searchParams.get("all") === "1";
  if (all) {
    return NextResponse.json([], { status: 200, headers: listCacheHeaders });
  }
  return NextResponse.json(
    {
      items: [],
      total: 0,
      hasMore: false,
      offset,
      limit,
    },
    { status: 200, headers: listCacheHeaders }
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const listCacheHeaders = {
    "Cache-Control": "private, s-maxage=30, stale-while-revalidate=120",
  };

  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return emptyBoardListResponse(searchParams, listCacheHeaders);
    }

    const category = searchParams.get("category");
    const role = (session.user as { role?: string }).role ?? "";
    const vis = boardVisibilityWhere(session.user.id, role);
    const where =
      category && isBoardCategory(category) ? { AND: [vis, { category }] } : vis;

    const limit = Math.min(20, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);
    const all = searchParams.get("all") === "1";

    /** 목록: 본문(description) 제외 — 상세에서만 로드 */
    const selectList = {
      id: true,
      title: true,
      category: true,
      isAnonymous: true,
      workspaceScope: true,
      attachments: true,
      createdAt: true,
      createdById: true,
      createdBy: { select: { name: true, position: true } },
    } as const;

    const mapRowList = (p: {
      id: string;
      title: string;
      category: string;
      isAnonymous: boolean;
      workspaceScope: string;
      attachments: string | null;
      createdAt: Date;
      createdById: string;
      createdBy: { name: string; position: string | null } | null;
    }) => {
      const anon = p.isAnonymous || boardCategoryIsAnonymous(p.category);
      return {
        id: p.id,
        title: p.title,
        category: p.category,
        isAnonymous: anon,
        attachments: safeParseAttachments(p.attachments),
        createdAt: p.createdAt.toISOString(),
        createdById: anon ? undefined : p.createdById,
        createdByName: anon ? "익명" : p.createdBy?.name ?? "삭제된 사용자",
        createdByPosition: anon ? null : p.createdBy?.position ?? null,
        workspaceScope: p.workspaceScope,
        isAuthorSelf: p.createdById === session.user.id,
      };
    };

    if (all) {
      let list;
      try {
        list = await prisma.boardPost.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: 20,
          select: selectList,
        });
      } catch (dbErr) {
        console.error("board query error:", dbErr);
        return NextResponse.json([], { status: 200, headers: listCacheHeaders });
      }
      return NextResponse.json(list.map(mapRowList), { headers: listCacheHeaders });
    }

    let total: number;
    let list;
    try {
      [total, list] = await Promise.all([
        prisma.boardPost.count({ where }),
        prisma.boardPost.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: offset,
          take: limit,
          select: selectList,
        }),
      ]);
    } catch (dbErr) {
      console.error("board query error:", dbErr);
      return emptyBoardListResponse(searchParams, listCacheHeaders);
    }

    return NextResponse.json(
      {
        items: list.map(mapRowList),
        total,
        hasMore: offset + list.length < total,
        offset,
        limit,
      },
      { headers: listCacheHeaders }
    );
  } catch (e) {
    console.error("Board GET:", e);
    return emptyBoardListResponse(searchParams, listCacheHeaders);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "요청 본문이 올바른 JSON이 아닙니다." }, { status: 400 });
    }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "제목과 구분을 입력하세요.",
          ...(process.env.NODE_ENV === "development" ? { details: parsed.error.flatten() } : {}),
        },
        { status: 400 }
      );
    }

    const attachments = (parsed.data.attachments ?? []).map((a) => ({
      url: a.url,
      name: (a.name && a.name.trim()) || "링크",
    }));

    const isAnonBoard = parsed.data.category === "ANONYMOUS";
    const workspaceScope =
      parsed.data.category === "FREE" || parsed.data.category === "ANONYMOUS"
        ? "TEAM"
        : parsed.data.workspaceScope;

    const descNorm = normalizeBoardDescriptionForStore(
      parsed.data.description,
      parsed.data.contentType === "html" ? "html" : "text"
    );
    const created = await prisma.boardPost.create({
      data: {
        title: parsed.data.title.trim(),
        description: descNorm || null,
        contentType: parsed.data.contentType === "html" ? "html" : "text",
        category: parsed.data.category,
        isAnonymous: isAnonBoard,
        workspaceScope,
        attachments: JSON.stringify(attachments),
        createdById: session.user.id,
      },
      select: {
        id: true,
        title: true,
        description: true,
        contentType: true,
        category: true,
        isAnonymous: true,
        workspaceScope: true,
        attachments: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      id: created.id,
      title: created.title,
      description: created.description ?? "",
      contentType: created.contentType ?? "text",
      category: created.category,
      isAnonymous: created.isAnonymous,
      workspaceScope: created.workspaceScope,
      createdAt: created.createdAt.toISOString(),
      attachments: safeParseAttachments(created.attachments),
    });
  } catch (e) {
    console.error("Board POST:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "자료 등록에 실패했습니다.", detail: process.env.NODE_ENV === "development" ? msg : undefined },
      { status: 500 }
    );
  }
}
