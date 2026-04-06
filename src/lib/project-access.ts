import prisma from "@/lib/prisma";
import { parseMentionUserIdsJson } from "@/lib/mention-user-ids-json";

export async function userCanAccessProject(
  userId: string,
  projectId: string,
  opts: { role?: string; email?: string; currentProjectId?: string | null }
): Promise<boolean> {
  const role = opts.role;
  const isExecutive = role === "EXECUTIVE" || role === "ADMIN";
  const masterEmail = (process.env.MASTER_EMAIL ?? "admin@complete.co.kr").trim().toLowerCase();
  const isMaster = String(opts.email ?? "").trim().toLowerCase() === masterEmail;
  if (isExecutive || isMaster) return true;
  if (opts.currentProjectId === projectId) return true;
  const row = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      users: { select: { id: true } },
      mentionedUserIds: true,
    },
  });
  if (!row) return false;
  if (row.users.some((u) => u.id === userId)) return true;
  return parseMentionUserIdsJson(row.mentionedUserIds).includes(userId);
}
