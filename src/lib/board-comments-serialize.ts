import prisma from "@/lib/prisma";
import { boardCategoryIsAnonymous } from "@/lib/board-category";

// [PERF-auto] 게시글 댓글 직렬화 — RSC·API GET 공유로 중복 fetch 제거

export type BoardCommentDto = {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; name: string | null; position: string | null };
  mentioned: { id: string; name: string | null }[];
};

export function maskBoardCommentUser(
  postAnonymous: boolean,
  viewerRole: string,
  user: { id: string; name: string | null; position: string | null }
): { id: string; name: string | null; position: string | null } {
  if (!postAnonymous || viewerRole === "EXECUTIVE") return user;
  return { id: "anonymous", name: "익명", position: null };
}

/** 게시글 메타(익명 여부)만 있으면 댓글 목록을 API와 동일 shape으로 조회 */
export async function fetchBoardPostCommentsDto(
  postId: string,
  opts: { postAnonymous: boolean; viewerRole: string }
): Promise<BoardCommentDto[]> {
  const comments = await prisma.boardPostComment.findMany({
    where: { boardPostId: postId },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true, position: true } },
    },
  });

  const mentionedIds = comments.flatMap((c) => {
    try {
      return JSON.parse(c.mentionedIds || "[]") as string[];
    } catch {
      return [];
    }
  });
  const uniqueMentionedIds = [...new Set(mentionedIds)];
  const mentionedUsers =
    uniqueMentionedIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: uniqueMentionedIds } },
          select: { id: true, name: true },
        });
  const mentionedMap = Object.fromEntries(mentionedUsers.map((u) => [u.id, u]));

  const { postAnonymous, viewerRole } = opts;
  return comments.map((c) => {
    let mentioned: { id: string; name: string | null }[] = [];
    try {
      const ids = JSON.parse(c.mentionedIds || "[]") as string[];
      mentioned = ids.map((mid) => ({
        id: mid,
        name: mentionedMap[mid]?.name ?? null,
      }));
    } catch {
      // ignore
    }
    return {
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      user: maskBoardCommentUser(postAnonymous, viewerRole, c.user),
      mentioned,
    };
  });
}

/** category 기준 익명 게시판 여부 (API 라우트와 동일 규칙) */
export function boardPostIsAnonymous(
  isAnonymous: boolean,
  category: string
): boolean {
  return isAnonymous || boardCategoryIsAnonymous(category);
}
