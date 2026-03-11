import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

/** 현재 로그인 사용자에게 부여된 프로젝트 1건 반환 (담당자 삭제용) */
export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        currentProjectId: true,
        currentProject: {
          select: {
            id: true,
            name: true,
            brand: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!user?.currentProjectId || !user.currentProject) {
      return NextResponse.json({ project: null });
    }
    return NextResponse.json({
      project: {
        id: user.currentProject.id,
        name: user.currentProject.name,
        brand: user.currentProject.brand,
      },
    });
  } catch (e) {
    console.error("GET /api/projects/me", e);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}
