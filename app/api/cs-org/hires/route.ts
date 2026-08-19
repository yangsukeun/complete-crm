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

export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const me = await loadMe(session.user.id);
    if (!me || !canViewCsOrg(me)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const hires = await prisma.csOrgHire.findMany({ orderBy: [{ joinDate: "asc" }, { name: "asc" }] });
    return NextResponse.json({ hires: hires.map(serializeHire) });
  } catch {
    console.error("[cs-org] hires get failed");
    return NextResponse.json({ error: "입사 예정 목록을 불러올 수 없습니다." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const me = await loadMe(session.user.id);
    if (!me || !canViewCsOrg(me)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as {
      name?: unknown;
      joinDate?: unknown;
      note?: unknown;
    };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "이름을 입력하세요." }, { status: 400 });
    const joinDate = typeof body.joinDate === "string" ? body.joinDate.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : "";
    const created = await prisma.csOrgHire.create({
      data: { name, joinDate: joinDate || null, note: note || null },
    });
    return NextResponse.json(serializeHire(created));
  } catch {
    console.error("[cs-org] hires post failed");
    return NextResponse.json({ error: "추가하지 못했습니다." }, { status: 500 });
  }
}
