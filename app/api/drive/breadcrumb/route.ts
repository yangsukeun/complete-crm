import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get("id")?.trim();
    if (!fileId) {
      return NextResponse.json({ path: [] });
    }

    const path: { id: string; name: string; parentId: string | null }[] = [];
    let currentId: string | null = fileId;
    let guard = 0;

    while (currentId && guard < 32) {
      guard += 1;
      const file: { id: string; name: string; parentId: string | null } | null =
        await prisma.driveFile.findUnique({
          where: { id: currentId },
          select: { id: true, name: true, parentId: true },
        });
      if (!file) break;
      path.unshift(file);
      currentId = file.parentId;
    }

    return NextResponse.json({ path });
  } catch (e) {
    console.error("[drive/breadcrumb GET]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
