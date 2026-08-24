import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { z } from "zod";
import { isDriveAdminRole } from "@/lib/drive/folder-trash-policy";
import { syncFolderTeamShares } from "@/lib/drive/team-share-sync";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  googleFolderId: z.string().min(5),
});

/** POST /api/drive/team-share/sync — 폴더 단위 Google 권한 동기화 */
export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!isDriveAdminRole(session.user.role)) {
      return NextResponse.json({ error: "대표/관리자만 동기화할 수 있습니다." }, { status: 403 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "googleFolderId가 필요합니다." }, { status: 400 });
    }

    const result = await syncFolderTeamShares(parsed.data.googleFolderId.trim());
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[drive/team-share/sync]", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg.length < 400 ? msg : "동기화 실패" },
      { status: 500 }
    );
  }
}
