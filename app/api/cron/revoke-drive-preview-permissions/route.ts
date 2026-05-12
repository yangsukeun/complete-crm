import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getDriveV3 } from "@/lib/google-drive-admin";
import { revokeExpiredDrivePreviewPermissions } from "@/lib/files/drive-temp-permission";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const unauthorized = verifyCronRequest(req);
  if (unauthorized) return unauthorized;
  try {
    const drive = getDriveV3();
    const n = await revokeExpiredDrivePreviewPermissions(drive, new Date());
    return NextResponse.json({ ok: true, revoked: n });
  } catch (e) {
    console.error("[cron/revoke-drive-preview-permissions]", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
