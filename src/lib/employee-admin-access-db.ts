import "server-only";
import prisma from "@/lib/prisma";
import { canManageEmployeesSync } from "@/lib/employee-admin-access";

export async function getEmployeeManagerContext(userId: string): Promise<{
  ok: boolean;
  role: string;
  position: string | null;
} | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, position: true },
  });
  if (!u) return null;
  return {
    ok: canManageEmployeesSync({ role: u.role, position: u.position }),
    role: String(u.role ?? ""),
    position: u.position,
  };
}
