import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { syncGoogleDriveToDb } from "@/lib/drive/sync-from-google";

export const runtime = "nodejs";
export const maxDuration = 300;

/** POST — Google Drive → DB 동기화 */
export async function POST() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const result = await syncGoogleDriveToDb();
    return NextResponse.json({
      ok: true,
      success: true,
      message: `동기화 완료: ${result.totalInDb}개 파일`,
      ...result,
    });
  } catch (e) {
    console.error("[drive/sync] POST", e);
    const msg = e instanceof Error ? e.message : String(e);
    const status =
      /GOOGLE_DRIVE_FOLDER_ID|서비스 계정|GOOGLE_SERVICE_ACCOUNT/i.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

/** GET — DB 동기화 상태 요약 */
export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const [total, folders, files, last] = await Promise.all([
      prisma.driveFile.count({ where: { source: "google_drive" } }),
      prisma.driveFile.count({ where: { source: "google_drive", isFolder: true } }),
      prisma.driveFile.count({ where: { source: "google_drive", isFolder: false } }),
      prisma.driveFile.findFirst({
        where: { source: "google_drive", lastSyncedAt: { not: null } },
        orderBy: { lastSyncedAt: "desc" },
        select: { lastSyncedAt: true },
      }),
    ]);

    return NextResponse.json({
      configured: Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID?.trim()),
      total,
      folders,
      files,
      lastSyncedAt: last?.lastSyncedAt?.toISOString() ?? null,
    });
  } catch (e) {
    console.error("[drive/sync] GET", e);
    return NextResponse.json({ error: "상태 조회 실패" }, { status: 500 });
  }
}
