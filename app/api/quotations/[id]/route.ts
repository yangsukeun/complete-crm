import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: {
        issuedBy: { select: { id: true, name: true } },
        items: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!quotation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(quotation);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "견적서를 불러올 수 없습니다." }, { status: 500 });
  }
}
