/**
 * 메모 API — 데이터는 Prisma `UserNote` (PostgreSQL).
 * Supabase `user_notes` + 동일 SQL을 쓰려면 DB·인증을 Supabase와 맞춰야 하며, 현재 앱은 NextAuth 세션으로 이 Prisma 라우트를 사용합니다.
 */
import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { normalizeUserNoteContent } from "@/lib/user-note-body";

const NOTE_COLORS = ["#fef08a", "#fde68a", "#fbcfe8", "#e9d5ff", "#bfdbfe", "#a7f3d0", "#fed7aa"];

const createSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  contentType: z.enum(["text", "html"]).optional().default("text"),
  projectId: z.string().min(1).nullable().optional(),
  colorHex: z.string().min(1).max(32).nullable().optional(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  content: z.string().optional(),
  contentType: z.enum(["text", "html"]).optional(),
  projectId: z.string().min(1).nullable().optional(),
  colorHex: z.string().min(1).max(32).nullable().optional(),
});

const noteSelect = {
  id: true,
  title: true,
  content: true,
  contentType: true,
  colorHex: true,
  projectId: true,
  createdAt: true,
  updatedAt: true,
  project: { select: { id: true, name: true, brand: { select: { name: true } } } },
} as const;

export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ notes: [] }, { status: 200 });
    }
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const unlinkedOnly = searchParams.get("unlinked") === "1";

    const where: { userId: string; projectId?: string | null } = { userId: session.user.id };
    if (unlinkedOnly) {
      where.projectId = null;
    } else if (projectId) {
      where.projectId = projectId;
    }

    let notes;
    try {
      notes = await prisma.userNote.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        select: noteSelect,
      });
    } catch (dbErr) {
      console.error(
        "[user-notes GET error]",
        dbErr && typeof dbErr === "object" && "code" in dbErr ? (dbErr as { code?: string }).code : "",
        dbErr instanceof Error ? dbErr.message : String(dbErr)
      );
      return NextResponse.json({ notes: [] }, { status: 200 });
    }

    return NextResponse.json({ notes });
  } catch (e) {
    console.error("[user-notes GET catch]", e);
    return NextResponse.json({ notes: [] }, { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }
    const body = await req.json();
    console.log("[user-notes POST body]", body);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      console.error("[user-notes POST] validation", parsed.error.flatten());
      return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const { title, content, contentType, projectId, colorHex } = parsed.data;
    const ct: "text" | "html" = contentType === "html" ? "html" : "text";
    let resolvedProjectId: string | null = projectId ?? null;
    if (resolvedProjectId) {
      const p = await prisma.project.findFirst({
        where: { id: resolvedProjectId, deletedAt: null },
        select: { id: true },
      });
      if (!p) {
        return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
      }
    }
    const note = await prisma.userNote.create({
      data: {
        userId: session.user.id,
        title: (title ?? "").trim(),
        content: normalizeUserNoteContent(content ?? "", ct),
        contentType: ct,
        colorHex: colorHex ?? NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)],
        projectId: resolvedProjectId,
      },
      select: noteSelect,
    });
    return NextResponse.json({ note });
  } catch (e) {
    console.error("[user-notes POST catch]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const { id, title, content, contentType, projectId, colorHex } = parsed.data;

    const owned = await prisma.userNote.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, contentType: true },
    });
    if (!owned) {
      return NextResponse.json({ error: "메모를 찾을 수 없습니다." }, { status: 404 });
    }

    const data: {
      title?: string;
      content?: string;
      contentType?: string;
      projectId?: string | null;
      colorHex?: string | null;
    } = {};
    if (title !== undefined) data.title = title.trim();
    const effectiveCt: "text" | "html" =
      contentType === "html" || contentType === "text"
        ? contentType
        : owned.contentType === "html"
          ? "html"
          : "text";
    if (content !== undefined) {
      data.content = normalizeUserNoteContent(content, effectiveCt);
    }
    if (contentType !== undefined) data.contentType = contentType;
    if (colorHex !== undefined) data.colorHex = colorHex;
    if (projectId !== undefined) {
      if (projectId) {
        const p = await prisma.project.findFirst({
          where: { id: projectId, deletedAt: null },
          select: { id: true },
        });
        if (!p) {
          return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
        }
        data.projectId = projectId;
      } else {
        data.projectId = null;
      }
    }

    const note = await prisma.userNote.update({
      where: { id },
      data,
      select: noteSelect,
    });
    return NextResponse.json({ note });
  } catch (e) {
    console.error("[user-notes PATCH catch]", e);
    return NextResponse.json({ error: "저장하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id 없음" }, { status: 400 });
    }
    const owned = await prisma.userNote.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: "메모를 찾을 수 없습니다." }, { status: 404 });
    }
    await prisma.userNote.delete({ where: { id } });
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[user-notes DELETE catch]", e);
    return NextResponse.json({ error: "삭제하지 못했습니다." }, { status: 500 });
  }
}
