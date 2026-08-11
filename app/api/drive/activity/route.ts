import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { isDriveAdminRole } from "@/lib/drive/folder-trash-policy";

export const runtime = "nodejs";

/** GET /api/drive/activity — ADMIN/EXECUTIVE, DriveActivityLog 목록 */
export async function GET(req: NextRequest) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!isDriveAdminRole(session.user.role)) {
      return NextResponse.json({ error: "대표/관리자만 접근할 수 있습니다." }, { status: 403 });
    }

    const driveFileId = req.nextUrl.searchParams.get("driveFileId")?.trim() || null;
    const take = Math.min(Number(req.nextUrl.searchParams.get("take") || 100) || 100, 200);

    const logs = await prisma.driveActivityLog.findMany({
      where: driveFileId ? { driveFileId } : undefined,
      orderBy: { createdAt: "desc" },
      take,
      include: {
        actor: { select: { id: true, name: true, email: true } },
        driveFile: { select: { id: true, name: true, isFolder: true } },
      },
    });

    return NextResponse.json({
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        detail: l.detail,
        createdAt: l.createdAt.toISOString(),
        actorId: l.actorId,
        actorName: l.actor.name,
        driveFileId: l.driveFileId,
        fileName: l.driveFile.name,
        isFolder: l.driveFile.isFolder,
      })),
    });
  } catch (e) {
    console.error("[drive/activity GET]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
