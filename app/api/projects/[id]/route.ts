import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

function isExecutive(role: string | undefined) {
  return role === "EXECUTIVE" || role === "ADMIN";
}

function isMasterEmail(email: unknown) {
  const masterEmail = (process.env.MASTER_EMAIL ?? "admin@complete.co.kr").trim().toLowerCase();
  return String(email ?? "").trim().toLowerCase() === masterEmail;
}

/** 프로젝트 소프트삭제: deletedAt/deletedById만 기록, 실제 row는 유지 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        role: true,
        currentProjectId: true,
        email: true,
      },
    });
    const role = (me?.role ?? session.user.role) as string | undefined;
    const memberRow = await prisma.project.findFirst({
      where: { id, users: { some: { id: session.user.id } } },
      select: { id: true },
    });
    const isProjectMember = !!memberRow;
    const canDelete =
      isExecutive(role) ||
      isMasterEmail(me?.email ?? (session.user as any)?.email) ||
      me?.currentProjectId === id ||
      isProjectMember;

    if (!canDelete) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();

    // 이미 삭제된 건은 멱등 처리
    const existing = await prisma.project.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }
    if (existing.deletedAt) {
      return NextResponse.json({ ok: true, alreadyDeleted: true });
    }

    await prisma.$transaction([
      prisma.project.update({
        where: { id },
        data: { deletedAt: now, deletedById: session.user.id },
      }),
      // 삭제된 프로젝트가 currentProject로 붙어있으면 해제(퇴사/정리 시 사용자 화면 깨짐 방지)
      prisma.user.updateMany({
        where: { currentProjectId: id },
        data: { currentProjectId: null },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/projects/[id]", e);
    return NextResponse.json({ error: "프로젝트를 삭제할 수 없습니다." }, { status: 500 });
  }
}

