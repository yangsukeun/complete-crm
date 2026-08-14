import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { canManageCsClients, canViewCsClients, csClientListWhere } from "@/lib/cs-client-access";
import { serializeCsClient, csClientInclude } from "@/lib/cs-client-serialize";

async function loadMe(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, department: true },
  });
}

export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const me = await loadMe(session.user.id);
    if (!me || !canViewCsClients(me)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const manage = canManageCsClients(me);
    const [rows, staff] = await Promise.all([
      prisma.csClient.findMany({
        where: csClientListWhere(me.id, manage),
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        include: csClientInclude,
      }),
      prisma.user.findMany({
        where: { department: { in: ["CS", "CS팀"] } },
        select: { id: true, name: true, position: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return NextResponse.json({
      clients: rows.map(serializeCsClient),
      staff,
      canManage: manage,
      scope: manage ? "all" : "mine",
    });
  } catch {
    console.error("[cs-clients] list failed");
    return NextResponse.json({ error: "목록을 불러올 수 없습니다." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const me = await loadMe(session.user.id);
    if (!me || !canManageCsClients(me)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      name?: unknown;
      startDate?: unknown;
      endDate?: unknown;
      note?: unknown;
    };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "업체명을 입력하세요." }, { status: 400 });
    }
    const startDate = typeof body.startDate === "string" ? body.startDate.trim() : "";
    const endDate = typeof body.endDate === "string" ? body.endDate.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : "";

    const created = await prisma.csClient.create({
      data: {
        name,
        startDate: startDate || null,
        endDate: endDate || null,
        note: note || null,
        isActive: !endDate,
        updatedBy: me.id,
      },
      include: csClientInclude,
    });
    return NextResponse.json(serializeCsClient(created));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "같은 업체명이 이미 있습니다." }, { status: 409 });
    }
    console.error("[cs-clients] create failed");
    return NextResponse.json({ error: "등록에 실패했습니다." }, { status: 500 });
  }
}
