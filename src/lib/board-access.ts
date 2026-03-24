import type { Prisma } from "@prisma/client";

/**
 * 목록/필터: 삭제되지 않은 글 중
 * - TEAM: 전 직원 조회 가능
 * - PERSONAL: 작성자 본인 + 임원·관리자만 (임원 개인모드 글은 직원에게 안 보임)
 */
export function boardVisibilityWhere(userId: string, role: string): Prisma.BoardPostWhereInput {
  const isExec = role === "EXECUTIVE" || role === "ADMIN";
  const notDeleted: Prisma.BoardPostWhereInput = { deletedAt: null };
  if (isExec) return notDeleted;
  return {
    ...notDeleted,
    OR: [{ workspaceScope: "TEAM" }, { createdById: userId, workspaceScope: "PERSONAL" }],
  };
}

export function canUserViewBoardPost(
  post: {
    deletedAt: Date | null;
    workspaceScope: string;
    createdById: string;
  },
  userId: string,
  role: string
): boolean {
  if (post.deletedAt) return false;
  const isExec = role === "EXECUTIVE" || role === "ADMIN";
  if (isExec) return true;
  if (post.workspaceScope === "TEAM") return true;
  return post.createdById === userId;
}
