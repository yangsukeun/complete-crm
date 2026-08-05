import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

function serializeDriveFile<T extends { size?: bigint | null }>(
  row: T
): Omit<T, "size"> & { size: string | null } {
  const { size, ...rest } = row;
  return {
    ...rest,
    size: size != null ? size.toString() : null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const parentIdRaw = searchParams.get("parentId");
    const parentId =
      parentIdRaw && parentIdRaw.trim() !== "" && parentIdRaw !== "null" ? parentIdRaw.trim() : null;
    const search = searchParams.get("search")?.trim() || "";

    if (search) {
      const files = await prisma.driveFile.findMany({
        where: {
          name: { contains: search, mode: "insensitive" },
        },
        orderBy: [{ isFolder: "desc" }, { name: "asc" }],
        take: 50,
        include: {
          _count: { select: { children: true } },
        },
      });
      return NextResponse.json({
        files: files.map(serializeDriveFile),
        search,
      });
    }

    const files = await prisma.driveFile.findMany({
      where: { parentId },
      orderBy: [{ isFolder: "desc" }, { name: "asc" }],
      include: {
        _count: { select: { children: true } },
      },
    });

    return NextResponse.json({
      files: files.map(serializeDriveFile),
      parentId,
    });
  } catch (e) {
    console.error("[drive/files GET]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
