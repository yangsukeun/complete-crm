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

export async function GET(req: Request) {
  console.log("[user-notes GET] Prisma 테이블: UserNote (코드의 user_notes / memos 아님)");
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json([], { status: 200 });
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
        select: {
          id: true,
          title: true,
          content: true,
          contentType: true,
          colorHex: true,
          projectId: true,
          createdAt: true,
          updatedAt: true,
          project: { select: { id: true, name: true, brand: { select: { name: true } } } },
        },
      });
    } catch (dbErr) {
      console.error("[user-notes GET] query error:", dbErr);
      return NextResponse.json([], { status: 200 });
    }

    return NextResponse.json(notes);
  } catch (e) {
    console.error("[user-notes GET catch]", e);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      select: {
        id: true,
        title: true,
        content: true,
        contentType: true,
        colorHex: true,
        projectId: true,
        createdAt: true,
        updatedAt: true,
        project: { select: { id: true, name: true, brand: { select: { name: true } } } },
      },
    });
    return NextResponse.json(note);
  } catch (e) {
    console.error("[user-notes POST catch]", e);
    return NextResponse.json({ error: "메모를 만들 수 없습니다." }, { status: 500 });
  }
}
