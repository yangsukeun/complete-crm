import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({ name: z.string().min(1).max(50) });

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const brands = await prisma.brand.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(brands);
  } catch (e) {
    console.error("GET /api/brands", e);
    // Brand 테이블 미생성 등으로 실패 시 빈 배열 반환 (500 방지)
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || (session.user.role !== "EXECUTIVE" && session.user.role !== "ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "브랜드명을 입력하세요." }, { status: 400 });
    }
    const brand = await prisma.brand.create({
      data: { name: parsed.data.name.trim() },
      select: { id: true, name: true },
    });
    return NextResponse.json(brand);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "브랜드를 생성할 수 없습니다." }, { status: 500 });
  }
}

