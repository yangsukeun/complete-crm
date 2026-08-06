import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { syncGoogleDriveToDb } from "@/lib/drive/sync-from-google";

export const runtime = "nodejs";
export const maxDuration = 300;

/** 매일 07:00 KST (UTC 22:00) — Google Drive → DriveFile 탐색기 동기화 */
export async function GET(req: Request) {
  const unauthorized = verifyCronRequest(req);
  if (unauthorized) return unauthorized;

  const started = Date.now();
  try {
    const result = await syncGoogleDriveToDb();
    const elapsedMs = Date.now() - started;
    console.log("[cron/sync-drive] ok", {
      upserted: result.upserted,
      folders: result.folders,
      removed: result.removed,
      totalInDb: result.totalInDb,
      explorerConfigured: result.explorerConfigured,
      rootPrefix: result.rootFolderId ? `${result.rootFolderId.slice(0, 6)}…` : null,
      elapsedMs,
    });
    return NextResponse.json({ ok: true, success: true, elapsedMs, ...result });
  } catch (e) {
    const elapsedMs = Date.now() - started;
    console.error("[cron/sync-drive] failed", { elapsedMs, error: e });
    Sentry.captureException(e);
    return NextResponse.json({ ok: false, error: String(e), elapsedMs }, { status: 500 });
  }
}
