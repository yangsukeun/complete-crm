import prisma from "@/lib/prisma";

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
  const memberRow = await prisma.project.findFirst({
    where: { id: projectId, users: { some: { id: userId } } },
    select: { id: true },
  });
  return !!memberRow;
}
