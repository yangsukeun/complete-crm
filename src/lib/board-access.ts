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
      /**
       * NOTE: 일부 배포 DB에서 `BoardPost.mentionedUserIds` 컬럼이 아직 없을 수 있어,
       *       목록 where 조건에서 해당 컬럼을 참조하면 즉시 500(P2022)이 납니다.
       *       컬럼 추가 마이그레이션이 완료되면 이 조건을 복구하세요.
       */
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
  // 위와 동일한 이유로 mentionedUserIds 기반 접근 제어는 임시 비활성화
  return post.createdById === userId;
}
