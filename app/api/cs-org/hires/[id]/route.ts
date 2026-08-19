import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { canViewCsOrg } from "@/lib/cs-client-access";

async function loadMe(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, department: true },
  });
}

function serializeHire(row: { id: string; name: string; joinDate: string | null; note: string | null }) {
  return {
    id: row.id,
    name: row.name,
    joinDate: row.joinDate ?? "",
    note: row.note ?? "",
  };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const me = await loadMe(session.user.id);
    if (!me || !canViewCsOrg(me)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const existing = await prisma.csOrgHire.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const data: { name?: string; joinDate?: string | null; note?: string | null } = {};
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: "이름을 입력하세요." }, { status: 400 });
      data.name = name;
    }
    if (typeof body.joinDate === "string") data.joinDate = body.joinDate.trim() || null;
    if (typeof body.note === "string") data.note = body.note.trim() || null;

    const updated = await prisma.csOrgHire.update({ where: { id }, data });
    return NextResponse.json(serializeHire(updated));
  } catch {
    console.error("[cs-org] hire patch failed");
    return NextResponse.json({ error: "저장하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const me = await loadMe(session.user.id);
    if (!me || !canViewCsOrg(me)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    await prisma.csOrgHire.delete({ where: { id } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch {
    console.error("[cs-org] hire delete failed");
    return NextResponse.json({ error: "삭제하지 못했습니다." }, { status: 500 });
  }
}
