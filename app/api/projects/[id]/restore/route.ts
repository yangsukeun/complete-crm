import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { isMasterSession } from "@/lib/master-account";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const project = await prisma.project.findFirst({
      where: { id },
      select: { deletedAt: true },
    });
    if (!project?.deletedAt) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isMaster = isMasterSession(session);
    const isMember = await prisma.project.findFirst({
      where: { id, users: { some: { id: session.user.id } } },
      select: { id: true },
    });
    if (!isMaster && !isMember) {
      return NextResponse.json({ error: "복구 권한이 없습니다." }, { status: 403 });
    }

    await prisma.project.update({
      where: { id },
      data: { deletedAt: null, deletedById: null, updatedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[projects/restore]", e);
    return NextResponse.json({ error: "복구에 실패했습니다." }, { status: 500 });
  }
}
