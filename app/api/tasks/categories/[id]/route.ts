import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isCollapsed: z.boolean().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const cat = await prisma.taskCategory.findUnique({
      where: { id },
      include: { children: true },
    });
    if (!cat) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(cat);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "카테고리를 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data: { name?: string; parentId?: string | null; sortOrder?: number; isCollapsed?: boolean } = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
    if (parsed.data.parentId !== undefined) data.parentId = parsed.data.parentId;
    if (parsed.data.sortOrder !== undefined) data.sortOrder = parsed.data.sortOrder;
    if (parsed.data.isCollapsed !== undefined) data.isCollapsed = parsed.data.isCollapsed;
    if (data.parentId === "") data.parentId = null;
    const updated = await prisma.taskCategory.update({
      where: { id },
      data,
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH /api/tasks/categories/[id] error:", e);
    const message = e instanceof Error ? e.message : "카테고리 수정에 실패했습니다.";
    return NextResponse.json(
      { error: "카테고리 수정에 실패했습니다.", details: process.env.NODE_ENV === "development" ? message : undefined },
      { status: 500 }
    );
  }
}

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
    await prisma.taskCategory.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/tasks/categories/[id] error:", e);
    const message = e instanceof Error ? e.message : "카테고리 삭제에 실패했습니다.";
    return NextResponse.json(
      { error: "카테고리 삭제에 실패했습니다.", details: process.env.NODE_ENV === "development" ? message : undefined },
      { status: 500 }
    );
  }
}
