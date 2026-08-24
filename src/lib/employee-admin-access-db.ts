import "server-only";
import prisma from "@/lib/prisma";
import {
  canManageEmployeesSync,
  resolveEmployeeManagerKind,
  type EmployeeManagerKind,
} from "@/lib/employee-admin-access";
import { resolveEffectivePermissionsJson } from "@/lib/permissions-resolve";

export async function getEmployeeManagerContext(userId: string): Promise<{
  ok: boolean;
  role: string;
  position: string | null;
  kind: EmployeeManagerKind;
} | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, position: true, permissions: true },
  });
  if (!u) return null;

  const effectiveJson = await resolveEffectivePermissionsJson(userId);
  const permissionsJson = effectiveJson ?? u.permissions ?? null;
  const kind = resolveEmployeeManagerKind({
    role: u.role,
    position: u.position,
    permissionsJson,
  });

  return {
    ok: canManageEmployeesSync({
      role: u.role,
      position: u.position,
      permissionsJson,
    }),
    role: String(u.role ?? ""),
    position: u.position,
    kind,
  };
}
