import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { boardVisibilityWhere } from "@/lib/board-access";
import { z } from "zod";

export const runtime = "nodejs";
/** Drive 업로드·DB 지연 대비 (Vercel Pro 등에서 상한 상향 시 반영) */
export const maxDuration = 60;

const categorySchema = z.enum(["COMPANY", "TRAINING"]);

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

export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const role = (session.user as { role?: string }).role ?? "";
    const vis = boardVisibilityWhere(session.user.id, role);
    const where =
      category && (category === "COMPANY" || category === "TRAINING")
        ? { AND: [vis, { category: category as "COMPANY" | "TRAINING" }] }
        : vis;

    const list = await prisma.boardPost.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        workspaceScope: true,
        attachments: true,
        createdAt: true,
        createdById: true,
        createdBy: { select: { name: true, position: true } },
      },
    });

    return NextResponse.json(
      list.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description ?? "",
        category: p.category,
        attachments: safeParseAttachments(p.attachments),
        createdAt: p.createdAt.toISOString(),
        createdById: p.createdById,
        createdByName: p.createdBy?.name ?? "삭제된 사용자",
        createdByPosition: p.createdBy?.position ?? null,
        workspaceScope: p.workspaceScope,
      }))
    );
  } catch (e) {
    console.error("Board GET:", e);
    return NextResponse.json({ error: "자료 목록을 불러올 수 없습니다." }, { status: 500 });
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
          error: "제목과 구분(회사자료/교육자료)을 입력하세요.",
          ...(process.env.NODE_ENV === "development" ? { details: parsed.error.flatten() } : {}),
        },
        { status: 400 }
      );
    }

    const attachments = (parsed.data.attachments ?? []).map((a) => ({
      url: a.url,
      name: (a.name && a.name.trim()) || "링크",
    }));

    const created = await prisma.boardPost.create({
      data: {
        title: parsed.data.title.trim(),
        description: parsed.data.description.trim() || null,
        category: parsed.data.category,
        workspaceScope: parsed.data.workspaceScope,
        attachments: JSON.stringify(attachments),
        createdById: session.user.id,
      },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        workspaceScope: true,
        attachments: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      id: created.id,
      title: created.title,
      description: created.description ?? "",
      category: created.category,
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
