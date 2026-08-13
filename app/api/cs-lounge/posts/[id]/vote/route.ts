import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { canAccessCsLounge } from "@/lib/cs-lounge-access";
import {
  loadLoungeViewer,
  loungePostSelect,
  noticePostSelect,
  serializeLoungePost,
} from "@/lib/cs-lounge-serialize";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const me = await loadLoungeViewer(session.user.id);
    if (!me || !canAccessCsLounge(me)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { value?: unknown };
    const value = String(body.value ?? "").toUpperCase();
    if (value !== "LIKE" && value !== "DISLIKE") {
      return NextResponse.json({ error: "value가 올바르지 않습니다." }, { status: 400 });
    }

    const post = await prisma.csLoungePost.findUnique({
      where: { id },
      select: { id: true, type: true, deletedAt: true },
    });
    if (!post || post.deletedAt) {
      return NextResponse.json({ error: "글을 찾을 수 없습니다." }, { status: 404 });
    }

    const existing = await prisma.csLoungeVote.findUnique({
      where: { postId_userId: { postId: id, userId: me.id } },
      select: { id: true, value: true },
    });

    if (existing && existing.value === value) {
      await prisma.csLoungeVote.delete({ where: { id: existing.id } });
    } else if (existing) {
      await prisma.csLoungeVote.update({
        where: { id: existing.id },
        data: { value },
      });
    } else {
      await prisma.csLoungeVote.create({
        data: { postId: id, userId: me.id, value },
      });
    }

    if (post.type === "LOUNGE") {
      const row = await prisma.csLoungePost.findUniqueOrThrow({
        where: { id },
        select: loungePostSelect,
      });
      return NextResponse.json(serializeLoungePost(row, me.id));
    }

    const row = await prisma.csLoungePost.findUniqueOrThrow({
      where: { id },
      select: noticePostSelect,
    });
    return NextResponse.json(
      serializeLoungePost({ ...row, authorName: row.author.name }, me.id)
    );
  } catch {
    console.error("[cs-lounge] vote failed");
    return NextResponse.json({ error: "투표에 실패했습니다." }, { status: 500 });
  }
}
