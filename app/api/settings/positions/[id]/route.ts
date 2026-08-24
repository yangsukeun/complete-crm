import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { normalizeFeaturePermissionKeys } from "@/lib/permissions";
import { z } from "zod";

const patchSchema = z.object({
  permissions: z.array(z.string()).nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "EXECUTIVE" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "대표만 수정할 수 있습니다." }, { status: 403 });
    }
    const { id } = await params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
    }
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });
    }
    if (parsed.data.permissions === undefined) {
      return NextResponse.json({ error: "permissions 필드가 필요합니다." }, { status: 400 });
    }
    const permissions =
      parsed.data.permissions == null || parsed.data.permissions.length === 0
        ? null
        : JSON.stringify(normalizeFeaturePermissionKeys(parsed.data.permissions));
    const updated = await prisma.position.update({
      where: { id },
      data: { permissions },
      select: { id: true, name: true, sortOrder: true, permissions: true },
    });
    revalidateTag("positions", "max");
    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH /api/settings/positions/[id]", e);
    return NextResponse.json({ error: "직책 권한을 저장할 수 없습니다." }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "EXECUTIVE" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "대표만 삭제할 수 있습니다." }, { status: 403 });
    }
    const { id } = await params;
    await prisma.position.delete({ where: { id } });
    revalidateTag("positions", "max");
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }
}
