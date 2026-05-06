import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";
import { isPrismaMissingUserAccountDisabledColumn } from "@/lib/prisma-account-disabled";

/**
 * 채팅 상대 선택 등용 직원 목록 — 동일 데이터를 짧게 캐시 후 API에서 본인만 제외.
 */
export const getCachedUsersMinimal = unstable_cache(
  async () => {
    const orderBy = { name: "asc" as const };
    const selectWithProject = {
      id: true,
      name: true,
      email: true,
      department: true,
      position: true,
      role: true,
      currentProject: {
        select: { id: true, name: true, brand: { select: { name: true } } },
      },
    } as const;
    const selectMinimal = {
      id: true,
      name: true,
      email: true,
      department: true,
      position: true,
      role: true,
    } as const;
    try {
      try {
        return await prisma.user.findMany({
          where: { accountDisabled: false },
          select: selectWithProject,
          orderBy,
        });
      } catch (e) {
        if (!isPrismaMissingUserAccountDisabledColumn(e)) throw e;
        return prisma.user.findMany({
          where: {},
          select: selectWithProject,
          orderBy,
        });
      }
    } catch {
      const list = await prisma.user.findMany({
        where: {},
        select: selectMinimal,
        orderBy,
      });
      return list.map((u) => ({ ...u, currentProject: null }));
    }
  },
  ["crm-users-minimal"],
  { revalidate: 60, tags: ["users-list"] }
);

/** 업무 담당자·모달 선택 등 — 프로젝트 포함 직원 목록 */
export const getCachedUsersWithProject = unstable_cache(
  async () => {
    const orderBy = { name: "asc" as const };
    const select = {
      id: true,
      name: true,
      email: true,
      department: true,
      position: true,
      currentProject: {
        select: { id: true, name: true, brand: { select: { name: true } } },
      },
    } as const;
    try {
      return await prisma.user.findMany({
        where: { accountDisabled: false },
        select,
        orderBy,
      });
    } catch (e) {
      if (!isPrismaMissingUserAccountDisabledColumn(e)) throw e;
      return prisma.user.findMany({
        where: {},
        select,
        orderBy,
      });
    }
  },
  ["crm-users-with-project"],
  { revalidate: 60, tags: ["users-list"] }
);
