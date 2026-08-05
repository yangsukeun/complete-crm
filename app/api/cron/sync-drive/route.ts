import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { syncGoogleDriveToDb } from "@/lib/drive/sync-from-google";

export const runtime = "nodejs";
export const maxDuration = 300;

/** 매일 새벽 2시(UTC) — Google Drive → DriveFile 동기화 */
export async function GET(req: Request) {
  const unauthorized = verifyCronRequest(req);
  if (unauthorized) return unauthorized;

  try {
    const result = await syncGoogleDriveToDb();
    return NextResponse.json({ ok: true, success: true, ...result });
  } catch (e) {
    console.error("[cron/sync-drive]", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
