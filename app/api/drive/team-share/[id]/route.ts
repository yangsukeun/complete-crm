import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { isDriveAdminRole } from "@/lib/drive/folder-trash-policy";
import { syncFolderTeamShares } from "@/lib/drive/team-share-sync";

export const runtime = "nodejs";
export const maxDuration = 120;

type RouteCtx = { params: Promise<{ id: string }> };

/** DELETE /api/drive/team-share/[id]?revoke=1 — 규칙 삭제 (+선택 회수 동기화) */
export async function DELETE(req: Request, ctx: RouteCtx) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!isDriveAdminRole(session.user.role)) {
      return NextResponse.json({ error: "대표/관리자만 삭제할 수 있습니다." }, { status: 403 });
    }

    const { id } = await ctx.params;
    const rule = await prisma.driveTeamShare.findUnique({ where: { id } });
    if (!rule) {
      return NextResponse.json({ error: "규칙을 찾을 수 없습니다." }, { status: 404 });
    }

    const revoke = new URL(req.url).searchParams.get("revoke") === "1";
    const folderId = rule.googleFolderId;

    await prisma.driveTeamShare.delete({ where: { id } });

    let sync = null;
    if (revoke) {
      const remaining = await prisma.driveTeamShare.count({ where: { googleFolderId: folderId } });
      // 남은 규칙 기준으로 동기화(없으면 desired 비움 → 보호 제외 reader/writer 회수)
      if (remaining >= 0) {
        sync = await syncFolderTeamShares(folderId);
      }
    }

    return NextResponse.json({ ok: true, sync });
  } catch (e) {
    console.error("[drive/team-share DELETE]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
