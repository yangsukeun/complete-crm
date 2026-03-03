import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  brandId: z.string().min(1),
  name: z.string().min(1).max(80),
});

export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const brandId = searchParams.get("brandId") ?? undefined;
    const projects = await prisma.project.findMany({
      where: brandId ? { brandId } : {},
      select: {
        id: true,
        name: true,
        brand: { select: { id: true, name: true } },
      },
      orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
    });
    return NextResponse.json(projects);
  } catch (e) {
    console.error("GET /api/projects", e);
    // Project 테이블 미생성 등으로 실패 시 빈 배열 반환 (500 방지)
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id || (session.user.role !== "EXECUTIVE" && session.user.role !== "ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "브랜드와 프로젝트명을 입력하세요." }, { status: 400 });
    }
    const project = await prisma.project.create({
      data: {
        brandId: parsed.data.brandId,
        name: parsed.data.name.trim(),
      },
      select: {
        id: true,
        name: true,
        brand: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(project);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "프로젝트를 생성할 수 없습니다." }, { status: 500 });
  }
}

