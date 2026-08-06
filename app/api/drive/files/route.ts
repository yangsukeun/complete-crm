import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import {
  getDriveExplorerRootId,
  isDriveExplorerFolderConfigured,
} from "@/lib/drive/explorer-root";
import type { Prisma } from "@prisma/client";

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

/**
 * 탐색기에 표시할 DriveFile 범위.
 * - EXPLORER ID 설정 시: 해당 rootId만 (업로드 폴더 동기화 분 제외)
 * - 미설정(폴백): 현재 폴백 루트 + rootId null(레거시) — 동작 유지
 */
function explorerListWhere(extra: Prisma.DriveFileWhereInput = {}): Prisma.DriveFileWhereInput {
  const rootId = getDriveExplorerRootId();
  const explorerOnly = isDriveExplorerFolderConfigured();

  if (!rootId) {
    return { source: "google_drive", ...extra };
  }

  if (explorerOnly) {
    return { source: "google_drive", rootId, ...extra };
  }

  return {
    source: "google_drive",
    OR: [{ rootId }, { rootId: null }],
    ...extra,
  };
}

export async function GET(req: NextRequest) {
  const t0 = Date.now();
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
      const tQ = Date.now();
      const files = await prisma.driveFile.findMany({
        where: explorerListWhere({
          name: { contains: search, mode: "insensitive" },
        }),
        orderBy: [{ isFolder: "desc" }, { name: "asc" }],
        take: 50,
        include: {
          _count: { select: { children: true } },
        },
      });
      const queryMs = Date.now() - tQ;
      console.log("[drive/files] timing", {
        mode: "search",
        queryMs,
        totalMs: Date.now() - t0,
        count: files.length,
      });
      return NextResponse.json({
        files: files.map(serializeDriveFile),
        search,
        explorerConfigured: isDriveExplorerFolderConfigured(),
        timing: { queryMs, totalMs: Date.now() - t0 },
      });
    }

    const tQ = Date.now();
    const files = await prisma.driveFile.findMany({
      where: explorerListWhere({ parentId }),
      orderBy: [{ isFolder: "desc" }, { name: "asc" }],
      include: {
        _count: { select: { children: true } },
      },
    });
    const queryMs = Date.now() - tQ;
    console.log("[drive/files] timing", {
      mode: "list",
      parentId: parentId ? parentId.slice(0, 8) + "…" : null,
      queryMs,
      totalMs: Date.now() - t0,
      count: files.length,
    });

    return NextResponse.json({
      files: files.map(serializeDriveFile),
      parentId,
      explorerConfigured: isDriveExplorerFolderConfigured(),
      timing: { queryMs, totalMs: Date.now() - t0 },
    });
  } catch (e) {
    console.error("[drive/files GET]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
