import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { normalizeBoardDescriptionForStore } from "@/lib/board-body";
import { safeParseAttachments } from "@/lib/board-attachments";
import { createNotificationWithOptions } from "@/lib/notifications";
import { extractMentionedUserIdsFromTaskDescription } from "@/lib/task-mention-utils";
import { z } from "zod";
import { BOARD_CATEGORIES, coerceBoardCategory } from "@/lib/board-category";

const categorySchema = z.preprocess((v: unknown) => coerceBoardCategory(v), z.enum(BOARD_CATEGORIES));

const workspaceScopeSchema = z.enum(["TEAM", "PERSONAL"]);

function boardCreateValidationMessage(err: z.ZodError): string {
  for (const iss of err.issues) {
    const key = iss.path[0];
    if (key === "title") {
      if (iss.code === "too_small") return "제목을 입력해 주세요.";
      if (iss.code === "too_big") return "제목은 200자 이하여야 합니다.";
      return "제목 형식을 확인해 주세요.";
    }
    if (key === "category") return "구분(회사 자료·교육자료 등)을 선택해 주세요.";
    if (key === "description" && iss.code === "too_big") {
      return "본문이 허용 길이(약 5만 자)를 초과했습니다.";
    }
    if (key === "attachments" || iss.path.includes("attachments")) {
      return "첨부 링크(URL) 형식을 확인해 주세요. (비어 있는 주소는 제거해 주세요)";
    }
    if (key === "contentType") return "본문 형식(텍스트/HTML)을 확인해 주세요.";
    if (key === "workspaceScope") return "작업 공간(팀/개인) 값을 확인해 주세요.";
  }
  return "입력값을 확인해 주세요. 제목·구분·본문·첨부를 점검해 주세요.";
}

const createSchema = z.object({
  title: z.preprocess((v: unknown) => {
    if (v == null) return "";
    if (typeof v === "string") return v.trim();
    return String(v).trim();
  }, z.string().min(1, "제목을 입력해 주세요.").max(200, "제목은 200자 이하여야 합니다.")),
  description: z.preprocess(
    (v) => (typeof v === "string" ? v : ""),
    z.string().max(50000)
  ),
  /** 잘못된 값은 text로 통일 — 파싱 실패·500 방지 */
  contentType: z.preprocess(
    (v) => (v === "html" ? "html" : "text"),
    z.enum(["text", "html"])
  ),
  category: categorySchema,
  workspaceScope: z.preprocess(
    (v) => (v === "PERSONAL" || v === "TEAM" ? v : undefined),
    workspaceScopeSchema.optional()
  ).default("TEAM"),
  attachments: z.preprocess(
    (v) => {
      if (!Array.isArray(v)) return [];
      return v
        .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
        .map((x) => ({
          url: typeof x.url === "string" ? x.url.trim() : "",
          name: typeof x.name === "string" ? x.name : undefined,
        }))
        .filter((x) => x.url.length > 0);
    },
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

export async function handleBoardPost(req: Request): Promise<Response> {
  console.log("[board POST] 엔드포인트 진입 (저장소: Prisma BoardPost)");
  let body: unknown;
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      body = await req.json();
    } catch (e) {
      console.error("[board POST] body 파싱 실패:", e);
      return NextResponse.json({ error: "body 파싱 실패" }, { status: 400 });
    }

    console.error("[board POST body]", JSON.stringify(body, null, 2));

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      console.error("[board POST] validation failed", parsed.error.flatten());
      const userMsg = boardCreateValidationMessage(parsed.error);
      return NextResponse.json(
        {
          error: userMsg,
          ...(process.env.NODE_ENV === "development"
            ? { details: parsed.error.flatten(), issues: parsed.error.issues }
            : {}),
        },
        { status: 400 }
      );
    }

    console.log("[board POST parsed]", {
      titleLen: parsed.data.title.length,
      category: parsed.data.category,
      contentType: parsed.data.contentType,
      descriptionLen: parsed.data.description.length,
      attachmentCount: parsed.data.attachments?.length ?? 0,
    });

    const attachments = (parsed.data.attachments ?? []).map((a) => ({
      url: a.url,
      name: (a.name && a.name.trim()) || "링크",
    }));

    const workspaceScope =
      parsed.data.category === "FREE" || parsed.data.category === "ANONYMOUS"
        ? "TEAM"
        : parsed.data.workspaceScope;

    let descNorm: string;
    try {
      descNorm = normalizeBoardDescriptionForStore(
        parsed.data.description,
        parsed.data.contentType === "html" ? "html" : "text"
      );
    } catch (normErr) {
      console.error("[board POST] 본문 정규화 실패", normErr);
      return NextResponse.json(
        { error: "본문을 저장할 수 없습니다. 형식·길이를 확인해 주세요." },
        { status: 400 }
      );
    }

    const mentionedIds = extractMentionedUserIdsFromTaskDescription(descNorm);

    let created;
    try {
      created = await prisma.boardPost.create({
        data: {
          title: parsed.data.title.trim(),
          description: descNorm || null,
          contentType: parsed.data.contentType === "html" ? "html" : "text",
          category: parsed.data.category,
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
    } catch (dbErr: unknown) {
      {
        const error = dbErr as {
          message?: string;
          stack?: string;
          code?: unknown;
          meta?: unknown;
        };
        console.error("[BOARD_500_DIAG]", {
          message: error?.message,
          stack: error?.stack,
          code: error?.code,
          meta: error?.meta,
          contentType:
            body && typeof body === "object" && !Array.isArray(body)
              ? (body as { contentType?: unknown }).contentType
              : undefined,
          timestamp: new Date().toISOString(),
        });
      }
      console.error("[board POST error]", dbErr);
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      const code =
        dbErr && typeof dbErr === "object" && "code" in dbErr
          ? String((dbErr as { code: unknown }).code)
          : "";
      const hint =
        code === "P2003"
          ? "로그인 정보와 DB가 맞지 않습니다. 다시 로그인한 뒤 시도해 주세요."
          : code === "P2002"
            ? "저장 충돌이 발생했습니다. 잠시 후 다시 시도해 주세요."
            : null;
      return NextResponse.json(
        {
          error: hint ?? "자료 등록에 실패했습니다.",
          ...(code ? { code } : {}),
          detail: msg,
        },
        { status: 500 }
      );
    }

    console.log("[board POST] created id=", created.id);

    const author = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true },
    });
    const authorName = author?.name?.trim() || "직원";
    // NOTE: mentionedUserIds 컬럼이 일부 DB에 없을 수 있어, 글 본문 멘션 알림은 임시 비활성화

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
    {
      const error = e as {
        message?: string;
        stack?: string;
        code?: unknown;
        meta?: unknown;
      };
      console.error("[BOARD_500_DIAG]", {
        message: error?.message,
        stack: error?.stack,
        code: error?.code,
        meta: error?.meta,
        contentType:
          body && typeof body === "object" && !Array.isArray(body)
            ? (body as { contentType?: unknown }).contentType
            : undefined,
        timestamp: new Date().toISOString(),
      });
    }
    console.error("[board POST catch]", e);
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
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
