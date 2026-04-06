import type { Prisma } from "@prisma/client";
import { parseMentionUserIdsJson } from "@/lib/mention-user-ids-json";

/**
 * 목록/필터: 삭제되지 않은 글 중
 * - TEAM: 전 직원 조회 가능
 * - PERSONAL: 작성자 본인 + 본문 멘션된 사용자 + 임원·관리자
 */
export function boardVisibilityWhere(userId: string, role: string): Prisma.BoardPostWhereInput {
  const isExec = role === "EXECUTIVE" || role === "ADMIN";
  const notDeleted: Prisma.BoardPostWhereInput = { deletedAt: null };
  if (isExec) return notDeleted;
  return {
    ...notDeleted,
    OR: [
      { workspaceScope: "TEAM" },
      { createdById: userId, workspaceScope: "PERSONAL" },
      { mentionedUserIds: { contains: userId } },
    ],
  };
}

export function canUserViewBoardPost(
  post: {
    deletedAt: Date | null;
    workspaceScope: string;
    createdById: string;
    mentionedUserIds?: string | null;
  },
  userId: string,
  role: string
): boolean {
  if (post.deletedAt) return false;
  const isExec = role === "EXECUTIVE" || role === "ADMIN";
  if (isExec) return true;
  if (post.workspaceScope === "TEAM") return true;
  const mentioned = parseMentionUserIdsJson(post.mentionedUserIds);
  if (mentioned.includes(userId)) return true;
  return post.createdById === userId;
}
