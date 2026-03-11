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
    const includeDeleted = searchParams.get("includeDeleted") === "1";
    const masterEmail = (process.env.MASTER_EMAIL ?? "admin@complete.co.kr").trim().toLowerCase();
    const isMaster = String((session.user as any)?.email ?? "").trim().toLowerCase() === masterEmail;

    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    const baseWhere: any = brandId ? { brandId } : {};
    const projects = await prisma.project.findMany({
      where: { ...baseWhere, deletedAt: null },
      select: {
        id: true,
        name: true,
        brand: { select: { id: true, name: true } },
      },
      orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
    });
    if (includeDeleted && (isAdmin || isMaster)) {
      const deletedProjects = await prisma.project.findMany({
        where: { ...baseWhere, deletedAt: { not: null } },
        select: {
          id: true,
          name: true,
          deletedAt: true,
          brand: { select: { id: true, name: true } },
          deletedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { deletedAt: "desc" },
      });
      return NextResponse.json({ projects, deletedProjects, isMaster: !!isMaster });
    }
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

