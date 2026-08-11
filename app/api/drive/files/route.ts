import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import {
  getDriveExplorerRootId,
  isDriveExplorerFolderConfigured,
} from "@/lib/drive/explorer-root";
import {
  assertCanAccessDriveFileId,
  filterAccessibleDriveFiles,
  loadDriveAccessActor,
} from "@/lib/drive/folder-access";
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

    const actor = await loadDriveAccessActor(session.user.id);
    if (!actor) {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 401 });
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
          trashed: false,
          name: { contains: search, mode: "insensitive" },
        }),
        orderBy: [{ isFolder: "desc" }, { name: "asc" }],
        take: 80,
        include: {
          _count: { select: { children: { where: { trashed: false } } } },
        },
      });
      const visible = await filterAccessibleDriveFiles(actor, files);
      const queryMs = Date.now() - tQ;
      console.log("[drive/files] timing", {
        mode: "search",
        queryMs,
        totalMs: Date.now() - t0,
        count: files.length,
        visible: visible.length,
      });
      return NextResponse.json({
        files: visible.slice(0, 50).map(serializeDriveFile),
        search,
        explorerConfigured: isDriveExplorerFolderConfigured(),
        timing: { queryMs, totalMs: Date.now() - t0 },
      });
    }

    if (parentId) {
      const gate = await assertCanAccessDriveFileId(actor, parentId);
      if (!gate.ok) {
        return NextResponse.json({ error: gate.error }, { status: gate.status });
      }
    }

    const tQ = Date.now();
    const files = await prisma.driveFile.findMany({
      where: explorerListWhere({ parentId, trashed: false }),
      orderBy: [{ isFolder: "desc" }, { name: "asc" }],
      include: {
        _count: { select: { children: { where: { trashed: false } } } },
      },
    });
    const visible = await filterAccessibleDriveFiles(actor, files);
    const queryMs = Date.now() - tQ;
    console.log("[drive/files] timing", {
      mode: "list",
      parentId: parentId ? parentId.slice(0, 8) + "…" : null,
      queryMs,
      totalMs: Date.now() - t0,
      count: files.length,
      visible: visible.length,
      role: actor.role,
      dept: actor.department || null,
    });

    return NextResponse.json({
      files: visible.map(serializeDriveFile),
      parentId,
      explorerConfigured: isDriveExplorerFolderConfigured(),
      timing: { queryMs, totalMs: Date.now() - t0 },
    });
  } catch (e) {
    console.error("[drive/files GET]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
