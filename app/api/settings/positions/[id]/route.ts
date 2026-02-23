import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "EXECUTIVE" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "대표만 삭제할 수 있습니다." }, { status: 403 });
    }
    const { id } = await params;
    await prisma.position.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }
}
