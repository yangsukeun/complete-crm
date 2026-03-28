import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { sanitizeNoteHtml } from "@/lib/sanitize-note-html";

const patchSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  projectId: z.string().min(1).nullable().optional(),
  colorHex: z.string().min(1).max(32).nullable().optional(),
});

async function getOwnedNote(noteId: string, userId: string) {
  return prisma.userNote.findFirst({
    where: { id: noteId, userId },
    select: { id: true },
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await ctx.params;
    const owned = await getOwnedNote(id, session.user.id);
    if (!owned) {
      return NextResponse.json({ error: "메모를 찾을 수 없습니다." }, { status: 404 });
    }
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const data: {
      title?: string;
      content?: string;
      projectId?: string | null;
      colorHex?: string | null;
    } = {};
    if (parsed.data.title !== undefined) data.title = parsed.data.title.trim();
    if (parsed.data.content !== undefined) data.content = sanitizeNoteHtml(parsed.data.content);
    if (parsed.data.colorHex !== undefined) data.colorHex = parsed.data.colorHex;
    if (parsed.data.projectId !== undefined) {
      const pid = parsed.data.projectId;
      if (pid) {
        const p = await prisma.project.findFirst({
          where: { id: pid, deletedAt: null },
          select: { id: true },
        });
        if (!p) {
          return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
        }
        data.projectId = pid;
      } else {
        data.projectId = null;
      }
    }
    const note = await prisma.userNote.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        content: true,
        colorHex: true,
        projectId: true,
        createdAt: true,
        updatedAt: true,
        project: { select: { id: true, name: true, brand: { select: { name: true } } } },
      },
    });
    return NextResponse.json(note);
  } catch (e) {
    console.error("PATCH /api/user-notes/[id]", e);
    return NextResponse.json({ error: "저장하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await ctx.params;
    const owned = await getOwnedNote(id, session.user.id);
    if (!owned) {
      return NextResponse.json({ error: "메모를 찾을 수 없습니다." }, { status: 404 });
    }
    await prisma.userNote.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/user-notes/[id]", e);
    return NextResponse.json({ error: "삭제하지 못했습니다." }, { status: 500 });
  }
}
