import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { canUserViewBoardPost } from "@/lib/board-access";
import { boardCategoryIsAnonymous } from "@/lib/board-category";
import {
  fetchBoardPostCommentsDto,
  maskBoardCommentUser,
} from "@/lib/board-comments-serialize";
import { createNotificationWithOptions } from "@/lib/notifications";
import { z } from "zod";

const postSchema = z.object({
  body: z.string().min(1).max(2000),
  mentionedUserIds: z.array(z.string()).optional().default([]),
});

/** GET: 게시글 댓글 목록 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: postId } = await params;
    const role = (session.user as { role?: string }).role ?? "";
    const post = await prisma.boardPost.findUnique({ where: { id: postId } });
    if (!post) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (
      !canUserViewBoardPost(
        {
          deletedAt: post.deletedAt,
          workspaceScope: post.workspaceScope,
          createdById: post.createdById,
        },
        session.user.id,
        role
      )
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const postAnonymous = post.isAnonymous || boardCategoryIsAnonymous(post.category);
    const payload = await fetchBoardPostCommentsDto(postId, {
      postAnonymous,
      viewerRole: role,
    });
    return NextResponse.json(payload);
  } catch (e) {
    console.error("Board comments GET:", e);
    return NextResponse.json(
      { error: "댓글을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

/** POST: 댓글 작성 (멘션 시 해당 사용자에게 BOARD_MENTION 알림) */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: postId } = await params;
    const role = (session.user as { role?: string }).role ?? "";
    const post = await prisma.boardPost.findUnique({ where: { id: postId } });
    if (!post) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (
      !canUserViewBoardPost(
        {
          deletedAt: post.deletedAt,
          workspaceScope: post.workspaceScope,
          createdById: post.createdById,
        },
        session.user.id,
        role
      )
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "댓글 내용을 입력하세요." },
        { status: 400 }
      );
    }

    const mentionedUserIds = [...new Set(parsed.data.mentionedUserIds)].filter(
      (id) => id && id !== session.user.id
    );

    const comment = await prisma.boardPostComment.create({
      data: {
        boardPostId: postId,
        userId: session.user.id,
        body: parsed.data.body.trim(),
        mentionedIds: JSON.stringify(mentionedUserIds),
      },
      include: {
        user: { select: { id: true, name: true, position: true } },
      },
    });

    const postAnonymous = post.isAnonymous || boardCategoryIsAnonymous(post.category);
    const commenterLabel = postAnonymous ? "익명" : session.user.name ?? "누군가";
    const postTitle = post.title;
    const link = `/board/${postId}`;

    for (const userId of mentionedUserIds) {
      await createNotificationWithOptions({
        userId,
        type: "BOARD_MENTION",
        message: `게시글 '${postTitle}'에서 ${commenterLabel}님이 회원님을 태그했습니다.`,
        link,
        actorId: session.user.id,
      });
    }

    let mentioned: { id: string; name: string | null }[] = [];
    if (mentionedUserIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: mentionedUserIds } },
        select: { id: true, name: true },
      });
      mentioned = mentionedUserIds.map((id) => ({
        id,
        name: users.find((u) => u.id === id)?.name ?? null,
      }));
    }

    return NextResponse.json({
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      user: maskBoardCommentUser(postAnonymous, role, comment.user),
      mentioned,
    });
  } catch (e) {
    console.error("Board comments POST:", e);
    return NextResponse.json(
      { error: "댓글 등록에 실패했습니다." },
      { status: 500 }
    );
  }
}
