import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const list = await prisma.quotation.findMany({
      orderBy: { issuedAt: "desc" },
      include: {
        issuedBy: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(list);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "견적서 목록을 불러올 수 없습니다." }, { status: 500 });
  }
}
