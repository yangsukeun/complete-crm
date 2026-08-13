import "server-only";
import prisma from "@/lib/prisma";
import { csUserIdsFrom } from "@/lib/schedule-team-access";

export async function loadCsSchedulerUserIds(): Promise<string[]> {
  const users = await prisma.user.findMany({
    select: { id: true, department: true, role: true },
  });
  return csUserIdsFrom(users);
}
