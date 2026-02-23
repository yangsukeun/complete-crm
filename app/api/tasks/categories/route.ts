import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const list = await prisma.taskCategory.findMany({
      orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(list);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "카테고리 목록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
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
    const { name, parentId, sortOrder } = parsed.data;
    if (parentId) {
      const parent = await prisma.taskCategory.findUnique({
        where: { id: parentId },
      });
      if (!parent) {
        return NextResponse.json({ error: "상위 카테고리를 찾을 수 없습니다." }, { status: 404 });
      }
    }
    const maxOrder = await prisma.taskCategory.aggregate({
      where: { parentId: parentId ?? null },
      _max: { sortOrder: true },
    });
    const nextOrder = sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1;
    const created = await prisma.taskCategory.create({
      data: {
        name: name.trim(),
        parentId: parentId ?? null,
        sortOrder: nextOrder,
      },
    });
    return NextResponse.json(created);
  } catch (e) {
    console.error("POST /api/tasks/categories error:", e);
    const message = e instanceof Error ? e.message : "카테고리를 추가할 수 없습니다.";
    return NextResponse.json(
      { error: "카테고리를 추가할 수 없습니다.", details: process.env.NODE_ENV === "development" ? message : undefined },
      { status: 500 }
    );
  }
}
