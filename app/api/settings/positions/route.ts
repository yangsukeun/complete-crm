import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getCachedPositions } from "@/lib/cache/settings-lists";
import { z } from "zod";

const createSchema = z.object({ name: z.string().min(1).max(100) });

export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const list = await getCachedPositions();
    return NextResponse.json(list, {
      headers: {
        "Cache-Control": "private, s-maxage=120, stale-while-revalidate=240",
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "직책 목록을 불러올 수 없습니다." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const role = (session.user as { role?: string }).role;
    if (role !== "EXECUTIVE" && role !== "ADMIN") {
      return NextResponse.json({ error: "대표만 직책을 등록할 수 있습니다." }, { status: 403 });
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
    }
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "직책명을 입력하세요." }, { status: 400 });
    }
    const name = parsed.data.name.trim();
    const existing = await prisma.position.findFirst({
      where: { name },
    });
    if (existing) {
      return NextResponse.json({ error: "이미 같은 이름의 직책이 있습니다." }, { status: 400 });
    }
    const maxOrder = await prisma.position.aggregate({ _max: { sortOrder: true } });
    const nextOrder = (maxOrder?._max?.sortOrder ?? 0) + 1;
    const created = await prisma.position.create({
      data: { name, sortOrder: nextOrder },
    });
    revalidateTag("positions", "max");
    return NextResponse.json(created);
  } catch (e) {
    console.error("POST /api/settings/positions error:", e);
    const message = e instanceof Error ? e.message : "직책 등록에 실패했습니다.";
    return NextResponse.json(
      { error: "직책 등록에 실패했습니다.", details: process.env.NODE_ENV === "development" ? message : undefined },
      { status: 500 }
    );
  }
}
