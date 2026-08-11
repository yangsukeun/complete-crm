import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getDriveExplorerRootId } from "@/lib/drive/explorer-root";
import { isDriveAdminRole } from "@/lib/drive/folder-trash-policy";

export const runtime = "nodejs";

/** GET /api/drive/trash — ADMIN/EXECUTIVE만, soft-trash된 탐색기 항목 */
export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!isDriveAdminRole(session.user.role)) {
      return NextResponse.json({ error: "대표/관리자만 접근할 수 있습니다." }, { status: 403 });
    }

    const rootId = getDriveExplorerRootId();
    const items = await prisma.driveFile.findMany({
      where: {
        trashed: true,
        source: "google_drive",
        ...(rootId ? { rootId } : {}),
      },
      orderBy: { trashedAt: "desc" },
      take: 200,
      select: {
        id: true,
        name: true,
        isFolder: true,
        driveFileId: true,
        parentId: true,
        createdBy: true,
        trashedAt: true,
        trashedBy: true,
        webViewLink: true,
        parent: { select: { id: true, name: true } },
        trashedByUser: { select: { id: true, name: true, email: true } },
        user: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      items: items.map((r) => ({
        id: r.id,
        name: r.name,
        isFolder: r.isFolder,
        driveFileId: r.driveFileId,
        parentId: r.parentId,
        parentName: r.parent?.name ?? null,
        createdBy: r.createdBy,
        createdByName: r.user?.name ?? null,
        trashedAt: r.trashedAt?.toISOString() ?? null,
        trashedBy: r.trashedBy,
        trashedByName: r.trashedByUser?.name ?? null,
        webViewLink: r.webViewLink,
      })),
    });
  } catch (e) {
    console.error("[drive/trash GET]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
