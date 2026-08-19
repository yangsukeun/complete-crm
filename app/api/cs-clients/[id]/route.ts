import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { canManageCsClients, canViewCsClients, csClientListWhere } from "@/lib/cs-client-access";
import { serializeCsClient, csClientInclude, csClientActiveFromPatch } from "@/lib/cs-client-serialize";
import { isCsClientPhase } from "@/lib/cs-org-month";

async function loadMe(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, department: true },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const me = await loadMe(session.user.id);
    if (!me || !canManageCsClients(me)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.csClient.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "업체를 찾을 수 없습니다." }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const data: {
      name?: string;
      startDate?: string | null;
      endDate?: string | null;
      note?: string | null;
      isActive?: boolean;
      phase?: string;
      updatedBy: string;
    } = { updatedBy: me.id };

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: "업체명을 입력하세요." }, { status: 400 });
      data.name = name;
    }
    if (typeof body.startDate === "string") data.startDate = body.startDate.trim() || null;
    if (typeof body.endDate === "string") data.endDate = body.endDate.trim() || null;
    if (typeof body.note === "string") data.note = body.note.trim() || null;
    if (isCsClientPhase(body.phase)) data.phase = body.phase;
    const derivedActive = csClientActiveFromPatch({
      endDate: typeof body.endDate === "string" ? body.endDate.trim() || null : undefined,
      isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
    });
    if (typeof derivedActive === "boolean") data.isActive = derivedActive;

    const updated = await prisma.csClient.update({
      where: { id },
      data,
      include: csClientInclude,
    });
    return NextResponse.json(serializeCsClient(updated));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "같은 업체명이 이미 있습니다." }, { status: 409 });
    }
    console.error("[cs-clients] patch failed");
    return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const me = await loadMe(session.user.id);
    if (!me || !canManageCsClients(me)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const existing = await prisma.csClient.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "업체를 찾을 수 없습니다." }, { status: 404 });
    }
    await prisma.csClient.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: me.id, isActive: false },
    });
    return NextResponse.json({ ok: true });
  } catch {
    console.error("[cs-clients] delete failed");
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await loadMe(session.user.id);
  if (!me || !canViewCsClients(me)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const manage = canManageCsClients(me);
  const row = await prisma.csClient.findFirst({
    where: { id, ...csClientListWhere(me.id, manage) },
    include: csClientInclude,
  });
  if (!row) return NextResponse.json({ error: "업체를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(serializeCsClient(row));
}
