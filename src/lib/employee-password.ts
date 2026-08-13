import { hash } from "bcryptjs";
import prisma from "@/lib/prisma";
import { canMutatePrivilegedEmployeeAccount } from "@/lib/employee-admin-access";
import {
  MIN_PASSWORD_CHANGE_LENGTH,
  PASSWORD_CHANGE_TOO_SHORT_MESSAGE,
} from "@/lib/password-policy";

export async function hashPasswordForStore(
  password: string
): Promise<{ ok: true; hashed: string } | { ok: false; error: string }> {
  const pw = password.trim();
  if (pw.length < MIN_PASSWORD_CHANGE_LENGTH) {
    return { ok: false, error: PASSWORD_CHANGE_TOO_SHORT_MESSAGE };
  }
  return { ok: true, hashed: await hash(pw, 10) };
}

export async function updateEmployeePassword(opts: {
  targetId: string;
  managerRole: string | null | undefined;
  password: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const hashed = await hashPasswordForStore(opts.password);
  if (!hashed.ok) {
    return { ok: false, status: 400, error: hashed.error };
  }

  const target = await prisma.user.findUnique({
    where: { id: opts.targetId },
    select: { id: true, role: true },
  });
  if (!target) {
    return { ok: false, status: 404, error: "해당 직원을 찾을 수 없습니다." };
  }

  const targetRole = String(target.role ?? "").toUpperCase();
  if (
    (targetRole === "EXECUTIVE" || targetRole === "ADMIN") &&
    !canMutatePrivilegedEmployeeAccount(opts.managerRole)
  ) {
    return {
      ok: false,
      status: 403,
      error: "대표/관리자 비밀번호는 대표·관리자만 재설정할 수 있습니다.",
    };
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { password: hashed.hashed },
  });
  return { ok: true };
}
