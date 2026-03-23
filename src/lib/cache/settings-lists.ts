import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";

/** 부서 마스터 — 자주 조회, 변경은 드묾 */
export const getCachedDepartments = unstable_cache(
  async () =>
    prisma.department.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, sortOrder: true },
    }),
  ["crm-departments"],
  { revalidate: 120, tags: ["departments"] }
);

/** 직책 마스터 */
export const getCachedPositions = unstable_cache(
  async () =>
    prisma.position.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, sortOrder: true },
    }),
  ["crm-positions"],
  { revalidate: 120, tags: ["positions"] }
);
