import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { plainTextFromHtml } from "@/lib/sanitize-note-html";

const bodySchema = z.object({
  brandId: z.string().min(1),
});

function baseNameFromNote(title: string, content: string): string {
  const t = title.trim();
  if (t) return t.slice(0, 80);
  const plain = plainTextFromHtml(content);
  if (plain) return plain.slice(0, 80);
  return "새 프로젝트";
}

async function uniqueProjectName(brandId: string, base: string): Promise<string> {
  let name = base;
  let n = 0;
  while (n < 50) {
    const clash = await prisma.project.findFirst({
      where: { brandId, name, deletedAt: null },
      select: { id: true },
    });
    if (!clash) return name;
    n += 1;
    name = `${base} (${n + 1})`.slice(0, 80);
  }
  return `${base} ${Date.now()}`.slice(0, 80);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    if (!isAdmin) {
      return NextResponse.json(
        { error: "프로젝트 생성은 대표·관리자만 할 수 있습니다." },
        { status: 403 }
      );
    }
    const { id: noteId } = await ctx.params;
    const note = await prisma.userNote.findFirst({
      where: { id: noteId, userId: session.user.id },
      select: { id: true, title: true, content: true },
    });
    if (!note) {
      return NextResponse.json({ error: "메모를 찾을 수 없습니다." }, { status: 404 });
    }
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "브랜드를 선택하세요." }, { status: 400 });
    }
    const brand = await prisma.brand.findFirst({
      where: { id: parsed.data.brandId },
      select: { id: true },
    });
    if (!brand) {
      return NextResponse.json({ error: "브랜드를 찾을 수 없습니다." }, { status: 404 });
    }
    const base = baseNameFromNote(note.title, note.content);
    const name = await uniqueProjectName(brand.id, base);

    const project = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          brandId: brand.id,
          name,
          users: { connect: { id: session.user.id } },
        },
        select: {
          id: true,
          name: true,
          brand: { select: { id: true, name: true } },
        },
      });
      await tx.userNote.update({
        where: { id: note.id },
        data: { projectId: p.id },
      });
      return p;
    });

    return NextResponse.json(project);
  } catch (e) {
    console.error("POST /api/user-notes/[id]/convert-to-project", e);
    return NextResponse.json({ error: "프로젝트로 만들지 못했습니다." }, { status: 500 });
  }
}
