import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { z } from "zod";
import { getEmployeeManagerContext } from "@/lib/employee-admin-access-db";
import { updateEmployeePassword } from "@/lib/employee-password";

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

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "비밀번호는 4자 이상 입력하세요." },
        { status: 400 }
      );
    }

    const result = await updateEmployeePassword({
      targetId: id,
      managerRole: manager.role,
      password: parsed.data.password,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/users/[id]/password]", e);
    return NextResponse.json({ error: "비밀번호 재설정에 실패했습니다." }, { status: 500 });
  }
}
