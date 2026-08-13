import { hash } from "bcryptjs";
import prisma from "@/lib/prisma";
import { canMutatePrivilegedEmployeeAccount } from "@/lib/employee-admin-access";

export async function updateEmployeePassword(opts: {
  targetId: string;
  managerRole: string | null | undefined;
  password: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const pw = opts.password.trim();
  if (pw.length < 4) {
    return { ok: false, status: 400, error: "비밀번호는 4자 이상 입력하세요." };
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

  const hashed = await hash(pw, 10);
  await prisma.user.update({
    where: { id: opts.targetId },
    data: { password: hashed },
  });
  return { ok: true };
}
