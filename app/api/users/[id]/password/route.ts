import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { hash } from "bcryptjs";
import { z } from "zod";
import { getEmployeeManagerContext } from "@/lib/employee-admin-access-db";
import { canMutatePrivilegedEmployeeAccount } from "@/lib/employee-admin-access";

const schema = z.object({
  password: z.string().min(4, "비밀번호는 4자 이상이어야 합니다."),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const manager = await getEmployeeManagerContext(session.user.id);
    if (!manager?.ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Bad Request" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, name: true },
    });
    if (!target) {
      return NextResponse.json({ error: "해당 직원을 찾을 수 없습니다." }, { status: 404 });
    }

    const targetRole = String(target.role ?? "").toUpperCase();
    if (
      (targetRole === "EXECUTIVE" || targetRole === "ADMIN") &&
      !canMutatePrivilegedEmployeeAccount(manager.role)
    ) {
      return NextResponse.json(
        { error: "대표/관리자 비밀번호는 대표·관리자만 재설정할 수 있습니다." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "비밀번호는 4자 이상 입력하세요." },
        { status: 400 }
      );
    }

    const hashed = await hash(parsed.data.password, 10);
    await prisma.user.update({
      where: { id },
      data: { password: hashed },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/users/[id]/password]", e);
    return NextResponse.json({ error: "비밀번호 재설정에 실패했습니다." }, { status: 500 });
  }
}
