import type { Prisma } from "@prisma/client";

/** 게시된 문서 중, 역할 제한이 없거나 현재 사용자 역할이 허용된 것만 */
export function helpArticlePublicWhere(
  userRole: string | null | undefined
): Prisma.HelpArticleWhereInput {
  const role = (userRole ?? "").trim();
  return {
    isPublished: true,
    OR: [{ targetRoles: { equals: [] } }, ...(role ? [{ targetRoles: { has: role } }] : [])],
  };
}
