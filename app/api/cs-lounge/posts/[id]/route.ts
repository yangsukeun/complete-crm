import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { canAccessCsLounge, canModerateCsLounge } from "@/lib/cs-lounge-access";
import { loadLoungeViewer } from "@/lib/cs-lounge-serialize";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const post = await prisma.csLoungePost.findUnique({
      where: { id },
      select: { id: true, authorId: true, deletedAt: true },
    });
    if (!post || post.deletedAt) {
      return NextResponse.json({ error: "글을 찾을 수 없습니다." }, { status: 404 });
    }
    const isMine = post.authorId === me.id;
    if (!isMine && !canModerateCsLounge(me)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.csLoungePost.update({
      where: { id: post.id },
      data: { deletedAt: new Date(), deletedBy: me.id },
    });
    return NextResponse.json({ ok: true });
  } catch {
    console.error("[cs-lounge] delete failed");
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }
}
