import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getDriveExplorerRootId } from "@/lib/drive/explorer-root";
import {
  assertCanAccessDriveFileId,
  loadDriveAccessActor,
} from "@/lib/drive/folder-access";

export const runtime = "nodejs";

const UNAVAILABLE = "폴더를 열 수 없습니다.";

type PathNode = {
  id: string;
  name: string;
  parentId: string | null;
  driveFileId: string | null;
};

/**
 * GET /api/drive/breadcrumb
 * - ?folder=<Google driveFileId>  (탐색기 URL 연동)
 * - ?id=<DB id>                   (레거시)
 *
 * 미존재·권한 없음 모두 404 + 동일 메시지 (정보 노출 방지).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const actor = await loadDriveAccessActor(session.user.id);
    if (!actor) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const folderDriveId = searchParams.get("folder")?.trim() || "";
    const fileDbId = searchParams.get("id")?.trim() || "";

    if (!folderDriveId && !fileDbId) {
      return NextResponse.json({ path: [] as PathNode[] });
    }

    const explorerRoot = getDriveExplorerRootId();
    // 탐색기 루트 Google ID로 들어오면 가상 루트와 동일
    if (folderDriveId && explorerRoot && folderDriveId === explorerRoot) {
      return NextResponse.json({ path: [] as PathNode[] });
    }

    let startId: string | null = null;

    if (folderDriveId) {
      const file = await prisma.driveFile.findFirst({
        where: {
          driveFileId: folderDriveId,
          source: "google_drive",
          isFolder: true,
          ...(explorerRoot ? { rootId: explorerRoot } : {}),
        },
        select: { id: true },
      });
      if (!file) {
        return NextResponse.json({ error: UNAVAILABLE }, { status: 404 });
      }
      startId = file.id;
    } else {
      const file = await prisma.driveFile.findUnique({
        where: { id: fileDbId },
        select: { id: true, isFolder: true },
      });
      if (!file?.isFolder) {
        return NextResponse.json({ error: UNAVAILABLE }, { status: 404 });
      }
      startId = file.id;
    }

    const gate = await assertCanAccessDriveFileId(actor, startId);
    if (!gate.ok) {
      return NextResponse.json({ error: UNAVAILABLE }, { status: 404 });
    }

    const path: PathNode[] = [];
    let currentId: string | null = startId;
    let guard = 0;

    while (currentId && guard < 32) {
      guard += 1;
      const file: PathNode | null = await prisma.driveFile.findUnique({
        where: { id: currentId },
        select: { id: true, name: true, parentId: true, driveFileId: true },
      });
      if (!file) break;
      path.unshift(file);
      currentId = file.parentId;
    }

    return NextResponse.json({ path });
  } catch (e) {
    console.error("[drive/breadcrumb GET]", e);
    return NextResponse.json({ error: UNAVAILABLE }, { status: 500 });
  }
}
