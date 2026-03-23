import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";

/**
 * 채팅 상대 선택 등용 직원 목록 — 동일 데이터를 짧게 캐시 후 API에서 본인만 제외.
 */
export const getCachedUsersMinimal = unstable_cache(
  async () => {
    try {
      return await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          department: true,
          position: true,
          role: true,
          currentProject: {
            select: { id: true, name: true, brand: { select: { name: true } } },
          },
        },
        orderBy: { name: "asc" },
      });
    } catch {
      const list = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          department: true,
          position: true,
          role: true,
        },
        orderBy: { name: "asc" },
      });
      return list.map((u) => ({ ...u, currentProject: null }));
    }
  },
  ["crm-users-minimal"],
  { revalidate: 60, tags: ["users-list"] }
);
