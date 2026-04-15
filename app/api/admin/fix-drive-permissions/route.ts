import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { google } from "googleapis";
import { grantDriveAnyoneWithLinkRead } from "@/lib/storage/google-drive-storage";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAdmin(role: string | undefined) {
  return role === "EXECUTIVE" || role === "ADMIN";
}

/**
 * 기존 Google Drive 업로드 파일들에 "링크 아는 사람 읽기" 권한 부여.
 * POST /api/admin/fix-drive-permissions?limit=200
 */
export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id || !isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
    if (!folderId) {
      return NextResponse.json(
        { error: "GOOGLE_DRIVE_FOLDER_ID가 설정되어 있지 않습니다." },
        { status: 400 }
      );
    }

    const hasCreds = Boolean(
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ||
        (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
          process.env.GOOGLE_PRIVATE_KEY?.trim())
    );
    if (!hasCreds) {
      return NextResponse.json(
        { error: "Google 서비스 계정 환경변수가 설정되어 있지 않습니다." },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(
      1000,
      Math.max(1, Number(searchParams.get("limit") ?? "200") || 200)
    );

    // 파일 목록은 Drive API로 가져오고, 권한 부여는 기존 유틸(grantDriveAnyoneWithLinkRead) 사용
    const auth = (() => {
      const jsonRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
      if (jsonRaw) {
        const parsed = JSON.parse(jsonRaw) as { client_email?: string; private_key?: string };
        if (!parsed.client_email || !parsed.private_key) {
          throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON에 client_email/private_key가 필요합니다.");
        }
        return new google.auth.JWT({
          email: parsed.client_email,
          key: parsed.private_key.replace(/\\n/g, "\n"),
          scopes: ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/drive.file"],
        });
      }
      const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
      const key = process.env.GOOGLE_PRIVATE_KEY?.trim()?.replace(/\\n/g, "\n");
      if (!email || !key) {
        throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY가 필요합니다.");
      }
      return new google.auth.JWT({
        email,
        key,
        scopes: ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/drive.file"],
      });
    })();

    const drive = google.drive({ version: "v3", auth });

    let pageToken: string | undefined = undefined;
    const fileIds: string[] = [];

    while (fileIds.length < limit) {
      const pageSize = Math.min(1000, limit - fileIds.length);
      const res: any = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id)",
        pageSize,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      const files = res.data.files ?? [];
      for (const f of files) {
        if (typeof f.id === "string" && f.id.trim()) fileIds.push(f.id.trim());
      }
      pageToken = res.data.nextPageToken ?? undefined;
      if (!pageToken || files.length === 0) break;
    }

    let updated = 0;
    let failed = 0;
    for (const fid of fileIds) {
      try {
        await grantDriveAnyoneWithLinkRead(fid);
        updated += 1;
      } catch {
        failed += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      scanned: fileIds.length,
      updated,
      failed,
      limit,
      hasMore: Boolean(pageToken),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin/fix-drive-permissions]", e);
    return NextResponse.json(
      { error: "처리에 실패했습니다.", details: process.env.NODE_ENV === "development" ? msg : undefined },
      { status: 500 }
    );
  }
}

