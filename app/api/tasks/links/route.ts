import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  parentId: z.string().min(1),
  childId: z.string().min(1),
});

// GET: 모든 TaskLink 조회
export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const links = await prisma.taskLink.findMany({
      include: {
        parent: { select: { id: true, title: true } },
        child: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(links);
  } catch (e) {
    console.error("GET /api/tasks/links error:", e);
    return NextResponse.json(
      { error: "연결 목록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

// POST: 추가 부모-자식 연결 생성
export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { parentId, childId } = parsed.data;

    // 자기 자신에게 연결 방지
    if (parentId === childId) {
      return NextResponse.json(
        { error: "자기 자신에게 연결할 수 없습니다." },
        { status: 400 }
      );
    }

    // 순환 참조 방지: childId가 parentId의 조상인지 확인
    async function isAncestor(potentialAncestorId: string, descendantId: string): Promise<boolean> {
      const task = await prisma.task.findUnique({
        where: { id: descendantId },
        select: { parentId: true },
      });
      if (!task) return false;
      if (task.parentId === potentialAncestorId) return true;
      if (task.parentId) {
        return isAncestor(potentialAncestorId, task.parentId);
      }
      // 추가 부모 링크도 확인
      const additionalParents = await prisma.taskLink.findMany({
        where: { childId: descendantId },
        select: { parentId: true },
      });
      for (const link of additionalParents) {
        if (link.parentId === potentialAncestorId) return true;
        if (await isAncestor(potentialAncestorId, link.parentId)) return true;
      }
      return false;
    }

    if (await isAncestor(childId, parentId)) {
      return NextResponse.json(
        { error: "순환 관계를 만들 수 없습니다." },
        { status: 400 }
      );
    }

    // 이미 기본 parentId로 연결되어 있는지 확인
    const childTask = await prisma.task.findUnique({
      where: { id: childId },
      select: { parentId: true },
    });
    if (childTask?.parentId === parentId) {
      return NextResponse.json(
        { error: "이미 기본 상위 업무로 연결되어 있습니다." },
        { status: 400 }
      );
    }

    // 중복 링크 확인
    const existingLink = await prisma.taskLink.findUnique({
      where: { parentId_childId: { parentId, childId } },
    });
    if (existingLink) {
      return NextResponse.json(
        { error: "이미 연결되어 있습니다." },
        { status: 400 }
      );
    }

    const link = await prisma.taskLink.create({
      data: { parentId, childId },
      include: {
        parent: { select: { id: true, title: true } },
        child: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json(link);
  } catch (e) {
    console.error("POST /api/tasks/links error:", e);
    return NextResponse.json(
      { error: "연결을 생성할 수 없습니다." },
      { status: 500 }
    );
  }
}

// DELETE: 연결 삭제 (query params: parentId, childId)
export async function DELETE(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const parentId = url.searchParams.get("parentId");
    const childId = url.searchParams.get("childId");

    if (!parentId || !childId) {
      return NextResponse.json(
        { error: "parentId와 childId가 필요합니다." },
        { status: 400 }
      );
    }

    await prisma.taskLink.delete({
      where: { parentId_childId: { parentId, childId } },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/tasks/links error:", e);
    return NextResponse.json(
      { error: "연결을 삭제할 수 없습니다." },
      { status: 500 }
    );
  }
}
