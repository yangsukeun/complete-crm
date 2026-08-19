import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { canViewCsOrg } from "@/lib/cs-client-access";

const MEMO_ID = "cs-org";

async function loadMe(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, department: true },
  });
}

export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const me = await loadMe(session.user.id);
    if (!me || !canViewCsOrg(me)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const memo = await prisma.csOrgMemo.upsert({
      where: { id: MEMO_ID },
      create: { id: MEMO_ID, content: "" },
      update: {},
    });
    return NextResponse.json({ content: memo.content, updatedAt: memo.updatedAt.toISOString() });
  } catch {
    console.error("[cs-org] memo get failed");
    return NextResponse.json({ error: "메모를 불러올 수 없습니다." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const me = await loadMe(session.user.id);
    if (!me || !canViewCsOrg(me)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as { content?: unknown };
    const content = typeof body.content === "string" ? body.content : "";
    const memo = await prisma.csOrgMemo.upsert({
      where: { id: MEMO_ID },
      create: { id: MEMO_ID, content, updatedBy: me.id },
      update: { content, updatedBy: me.id },
    });
    return NextResponse.json({ content: memo.content, updatedAt: memo.updatedAt.toISOString() });
  } catch {
    console.error("[cs-org] memo put failed");
    return NextResponse.json({ error: "메모를 저장할 수 없습니다." }, { status: 500 });
  }
}
