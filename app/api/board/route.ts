import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const categorySchema = z.enum(["COMPANY", "TRAINING"]);
const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(50000).optional().default(""),
  category: categorySchema,
  attachments: z
    .array(z.object({ url: z.string(), name: z.string() }))
    .max(20)
    .optional()
    .default([]),
});

export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");

    const list = await prisma.boardPost.findMany({
      where:
        category && (category === "COMPANY" || category === "TRAINING")
          ? { category }
          : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        attachments: true,
        createdAt: true,
        createdById: true,
        createdBy: { select: { name: true, position: true } },
      },
    });

    return NextResponse.json(
      list.map((p: any) => ({
        id: p.id,
        title: p.title,
        description: p.description ?? "",
        category: p.category,
        attachments: JSON.parse(p.attachments || "[]") as { url: string; name: string }[],
        createdAt: p.createdAt.toISOString(),
        createdById: p.createdById,
        createdByName: p.createdBy.name,
        createdByPosition: p.createdBy.position,
      }))
    );
  } catch (e) {
    console.error("Board GET:", e);
    return NextResponse.json({ error: "자료 목록을 불러올 수 없습니다." }, { status: 500 });
  }
}

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
        { error: "제목과 구분(회사자료/교육자료)을 입력하세요." },
        { status: 400 }
      );
    }

    const created = await prisma.boardPost.create({
      data: {
        title: parsed.data.title.trim(),
        description: (parsed.data.description ?? "").trim() || null,
        category: parsed.data.category,
        attachments: JSON.stringify(parsed.data.attachments ?? []),
        createdById: session.user.id,
      },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        attachments: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      ...created,
      createdAt: created.createdAt.toISOString(),
      attachments: JSON.parse(created.attachments || "[]"),
    });
  } catch (e) {
    console.error("Board POST:", e);
    return NextResponse.json({ error: "자료 등록에 실패했습니다." }, { status: 500 });
  }
}
