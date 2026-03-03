import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    if (!date || !dateRegex.test(date)) {
      return NextResponse.json(
        { error: "날짜는 YYYY-MM-DD 형식이어야 합니다." },
        { status: 400 }
      );
    }
    const memo = await prisma.dailyMemo.findUnique({
      where: {
        userId_date: { userId: session.user.id, date },
      },
      select: { id: true, date: true, content: true },
    });
    return NextResponse.json(memo ?? { date, content: "" });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "메모를 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

const putSchema = z.object({
  date: z.string().regex(dateRegex),
  content: z.string(),
});

export async function PUT(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "날짜(YYYY-MM-DD)와 내용을 입력하세요." },
        { status: 400 }
      );
    }
    const memo = await prisma.dailyMemo.upsert({
      where: {
        userId_date: { userId: session.user.id, date: parsed.data.date },
      },
      create: {
        userId: session.user.id,
        date: parsed.data.date,
        content: parsed.data.content,
      },
      update: { content: parsed.data.content },
      select: { id: true, date: true, content: true },
    });
    return NextResponse.json(memo);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "메모를 저장할 수 없습니다." },
      { status: 500 }
    );
  }
}
