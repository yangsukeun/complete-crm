import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
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
      createdByName: post.createdBy.name,
      createdByPosition: post.createdBy.position,
    });
  } catch (e) {
    console.error("Board GET [id]:", e);
    return NextResponse.json({ error: "자료를 불러올 수 없습니다." }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
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
