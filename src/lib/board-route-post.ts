import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { normalizeBoardDescriptionForStore } from "@/lib/board-body";
import { safeParseAttachments } from "@/lib/board-attachments";
import { z } from "zod";

const categorySchema = z.enum(["COMPANY", "TRAINING", "FREE", "ANONYMOUS"]);
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

export async function handleBoardPost(req: Request): Promise<Response> {
  console.log("[board POST] 엔드포인트 진입 (저장소: Prisma BoardPost)");
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

    console.log("[board POST body]", body);

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      console.error("[board POST] validation failed", parsed.error.flatten());
      return NextResponse.json(
        {
          error: "제목과 구분을 입력하세요.",
          ...(process.env.NODE_ENV === "development" ? { details: parsed.error.flatten() } : {}),
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

    const isAnonBoard = parsed.data.category === "ANONYMOUS";
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
    let created;
    try {
      created = await prisma.boardPost.create({
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
    } catch (dbErr) {
      console.error("[board POST error]", dbErr);
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      return NextResponse.json(
        {
          error: "자료 등록에 실패했습니다.",
          detail: process.env.NODE_ENV === "development" ? msg : undefined,
        },
        { status: 500 }
      );
    }

    console.log("[board POST] created id=", created.id);

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
    console.error("[board 에러 원인]", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "자료 등록에 실패했습니다.", detail: process.env.NODE_ENV === "development" ? msg : undefined },
      { status: 500 }
    );
  }
}
