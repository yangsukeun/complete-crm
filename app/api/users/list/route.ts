import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

/** 회사 모드에서 채팅 상대 선택 등용 - 로그인 사용자 본인 제외 직원 목록 */
export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let users: Array<{
      id: string;
      name: string;
      email: string;
      department: string | null;
      position: string | null;
      role: string;
      currentProject: { id: string; name: string; brand: { name: string } } | null;
    }>;
    try {
      users = await prisma.user.findMany({
        where: { id: { not: session.user.id } },
        select: {
          id: true,
          name: true,
          email: true,
          department: true,
          position: true,
          role: true,
          currentProject: { select: { id: true, name: true, brand: { select: { name: true } } } },
        },
        orderBy: { name: "asc" },
      });
    } catch (selectErr) {
      // currentProject/Project 관계 미적용 시 fallback
      const list = await prisma.user.findMany({
        where: { id: { not: session.user.id } },
        select: {
          id: true,
          name: true,
          email: true,
          department: true,
          position: true,
          role: true,
        },
        orderBy: { name: "asc" },
      });
      users = list.map((u: any) => ({ ...u, currentProject: null }));
    }

    return NextResponse.json(users);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "직원 목록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}
