import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(50000).optional(),
  category: z.enum(["COMPANY", "TRAINING"]).optional(),
  attachments: z.array(z.object({ url: z.string().min(1), name: z.string().optional() })).max(20).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const post = await prisma.boardPost.findUnique({
      where: { id },
      include: { createdBy: { select: { name: true, position: true } } },
    });
    if (!post) {
      return NextResponse.json({ error: "해당 자료를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      id: post.id,
      title: post.title,
      description: post.description ?? "",
      category: post.category,
      attachments: JSON.parse(post.attachments || "[]") as { url: string; name: string }[],
      createdAt: post.createdAt.toISOString(),
      createdByName: post.createdBy?.name ?? "삭제된 사용자",
      createdByPosition: post.createdBy?.position ?? null,
    });
  } catch (e) {
    console.error("Board GET [id]:", e);
    return NextResponse.json({ error: "자료를 불러올 수 없습니다." }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const post = await prisma.boardPost.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json({ error: "해당 자료를 찾을 수 없습니다." }, { status: 404 });
    }

    const role = (session.user as { role?: string }).role;
    const isAdmin = role === "TEAM_LEAD" || role === "EXECUTIVE" || role === "ADMIN";
    const isAuthor = post.createdById === session.user.id;
    if (!isAuthor && !isAdmin) {
      return NextResponse.json({ error: "수정 권한이 없습니다." }, { status: 403 });
    }

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data: { title?: string; description?: string | null; category?: string; attachments?: string } = {};
    if (parsed.data.title !== undefined) data.title = parsed.data.title.trim();
    if (parsed.data.description !== undefined) data.description = (parsed.data.description ?? "").trim() || null;
    if (parsed.data.category !== undefined) data.category = parsed.data.category;
    if (parsed.data.attachments !== undefined) {
      data.attachments = JSON.stringify(
        (parsed.data.attachments ?? []).map((a: { url: string; name?: string }) => ({
          url: a.url,
          name: (a.name && a.name.trim()) || "링크",
        }))
      );
    }

    const updated = await prisma.boardPost.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        attachments: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      attachments: JSON.parse(updated.attachments || "[]"),
    });
  } catch (e) {
    console.error("Board PATCH:", e);
    return NextResponse.json({ error: "수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const post = await prisma.boardPost.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json({ error: "해당 자료를 찾을 수 없습니다." }, { status: 404 });
    }

    const role = (session.user as { role?: string }).role;
    const isAdmin = role === "TEAM_LEAD" || role === "EXECUTIVE" || role === "ADMIN";
    if (post.createdById !== session.user.id && !isAdmin) {
      return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });
    }

    await prisma.boardPost.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Board DELETE:", e);
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }
}
