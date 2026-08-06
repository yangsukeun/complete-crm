/**
 * 게시판 API — Prisma 모델 `BoardPost` → PostgreSQL 테이블 `"BoardPost"` (Prisma 기본명, snake_case `board_posts` 아님).
 * 공지는 별도 `Announcement` 모델.
 *
 * GET 모듈은 DOMPurify(isomorphic-dompurify)를 절대 정적 import하지 않습니다. Vercel 등에서 POST용
 * `board-body` 체인이 라우트 파일 로드 시 평가되며 함수 초기화 전 500이 나는 경우를 막기 위함입니다.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { boardVisibilityWhere } from "@/lib/board-access";
import { boardCategoryIsAnonymous, isBoardCategory } from "@/lib/board-category";
import { safeParseAttachments } from "@/lib/board-attachments";
import { buildBoardListPreview } from "@/lib/board-list-preview";

export const runtime = "nodejs";
/** Drive 업로드·DB 지연 대비 (Vercel Pro 등에서 상한 상향 시 반영) */
export const maxDuration = 60;

function boardListSearchParams(req: Request): URLSearchParams {
  try {
    const nu = (req as NextRequest).nextUrl;
    if (nu?.searchParams) return nu.searchParams;
  } catch {
    /* ignore */
  }
  try {
    return new URL(req.url).searchParams;
  } catch {
    try {
      const host = req.headers.get("host") ?? "localhost";
      const proto = req.headers.get("x-forwarded-proto") ?? "https";
      return new URL(req.url, `${proto}://${host}`).searchParams;
    } catch {
      return new URLSearchParams();
    }
  }
}

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

async function boardGetHandler(req: Request) {
  const listCacheHeaders = {
    "Cache-Control": "private, s-maxage=30, stale-while-revalidate=120",
  };
  const searchParams = boardListSearchParams(req);

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

    /** 목록: 본문은 서버에서만 읽고 listPreview만 응답(클라이언트로 raw 미전송) */
    const selectList = {
      id: true,
      title: true,
      category: true,
      workspaceScope: true,
      contentType: true,
      description: true,
      attachments: true,
      createdAt: true,
      createdById: true,
      createdBy: { select: { name: true, position: true } },
      revisions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { userName: true, createdAt: true },
      },
    } as const;

    const mapRowList = (p: {
      id: string;
      title: string;
      category: string;
      workspaceScope: string;
      contentType: string;
      description: string | null;
      attachments: string | null;
      createdAt: Date;
      createdById: string;
      createdBy: { name: string; position: string | null } | null;
      revisions: { userName: string; createdAt: Date }[];
    }) => {
      const anon = boardCategoryIsAnonymous(p.category);
      const listPreview = buildBoardListPreview(p.description, p.contentType, p.attachments);
      const lastRev = p.revisions?.[0] ?? null;
      return {
        id: p.id,
        title: p.title,
        category: p.category,
        isAnonymous: anon,
        attachments: safeParseAttachments(p.attachments),
        listPreview,
        createdAt: p.createdAt.toISOString(),
        createdById: anon ? undefined : p.createdById,
        createdByName: anon ? "익명" : p.createdBy?.name ?? "삭제된 사용자",
        createdByPosition: anon ? null : p.createdBy?.position ?? null,
        lastEditedByName: anon ? null : lastRev?.userName ?? null,
        updatedAt: (lastRev?.createdAt ?? p.createdAt).toISOString(),
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
    console.error("[board 에러 원인]", e);
    return emptyBoardListResponse(searchParams, listCacheHeaders);
  }
}

/** 프로덕션에서 예외가 Next 전역 500 HTML로 번지지 않도록 최외곽에서도 JSON으로 삼킵니다. */
export async function GET(req: Request) {
  try {
    return await boardGetHandler(req);
  } catch (e) {
    console.error("[board GET fatal]", e);
    return NextResponse.json(
      { items: [], total: 0, hasMore: false, offset: 0, limit: 20 },
      {
        status: 200,
        headers: { "Cache-Control": "private, s-maxage=30, stale-while-revalidate=120" },
      }
    );
  }
}

/** POST는 `board-body` → DOMPurify 체인이 있는 모듈만 동적 로드합니다. */
export async function POST(req: Request) {
  try {
    try {
      const preview = await req.clone().json();
      const body =
        preview && typeof preview === "object" && !Array.isArray(preview)
          ? (preview as Record<string, unknown>)
          : {};
      console.error("[board POST] body keys:", Object.keys(body));
      console.error(
        "[board POST] body:",
        JSON.stringify(preview).slice(0, 500)
      );
    } catch (e) {
      console.error("[board POST] body 미리보기 파싱 실패:", e);
    }
    const { handleBoardPost } = await import("@/lib/board-route-post");
    return handleBoardPost(req);
  } catch (e) {
    console.error(
      "[board POST] 에러 타입:",
      e && typeof e === "object" && "constructor" in e
        ? (e as { constructor?: { name?: string } }).constructor?.name
        : typeof e
    );
    console.error(
      "[board POST] 메시지:",
      e instanceof Error ? e.message : String(e)
    );
    if (e instanceof Error && e.stack) {
      console.error(
        "[board POST] 스택:",
        e.stack.split("\n").slice(0, 5).join("\n")
      );
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
