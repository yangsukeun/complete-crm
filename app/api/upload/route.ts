import { randomUUID } from "crypto";
import { NextResponse, after } from "next/server";
import { getAppSession } from "@/auth";
import { storeUploadedFile, resolveStorageProvider } from "@/lib/storage";
import {
  grantDriveAnyoneWithLinkRead,
  parseGoogleDriveFileIdFromUrl,
} from "@/lib/storage/google-drive-storage";
import {
  inferStorageExtension,
  sanitizeUploadDisplayName,
  validateUploadFile,
} from "@/lib/upload-policy";
import { DailyUploadQuotaError, releaseDailyUploadBytes, reserveDailyUploadBytes } from "@/lib/upload-daily-quota";

export const runtime = "nodejs";
/** 대용량 멀티파트 업로드 대비(Vercel 플랜별 상한은 대시보드에서 확인) */
export const maxDuration = 300;

export async function POST(req: Request) {
  let reservedBytes = 0;
  let reservedUserId: string | null = null;
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "파일을 선택하세요." }, { status: 400 });
    }

    const clientCheck = validateUploadFile(file);
    if (!clientCheck.ok) {
      return NextResponse.json({ error: clientCheck.error }, { status: 400 });
    }

    const mime = (file.type || "").toLowerCase() || "application/octet-stream";
    const displayName = sanitizeUploadDisplayName(file.name);
    const fileExt = inferStorageExtension(mime, file.name);
    const storageKey = `u-${randomUUID()}.${fileExt}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const provider = resolveStorageProvider(buffer.byteLength);
    if (provider === "vercel-blob" && !process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
      if (process.env.VERCEL) {
        return NextResponse.json(
          {
            error:
              "배포 환경에서 파일 저장소가 설정되지 않았습니다. Google Drive(GOOGLE_DRIVE_FOLDER_ID + 서비스 계정) 또는 BLOB_READ_WRITE_TOKEN, 또는 NAS(WebDAV)를 설정하세요. README의 파일 저장소 절을 참고하세요.",
          },
          { status: 503 }
        );
      }
    }

    await reserveDailyUploadBytes(userId, buffer.byteLength);
    reservedBytes = buffer.byteLength;
    reservedUserId = userId;

    const result = await storeUploadedFile({
      buffer,
      filename: storageKey,
      mime,
      originalName: displayName,
    });

    reservedBytes = 0;
    reservedUserId = null;

    if (result.provider === "google-drive") {
      const fid = parseGoogleDriveFileIdFromUrl(result.url);
      if (fid) after(() => grantDriveAnyoneWithLinkRead(fid));
    }

    return NextResponse.json({
      url: result.url,
      name: result.name,
      provider: result.provider,
      ...(result.mirrorWarning ? { mirrorWarning: result.mirrorWarning } : {}),
    });
  } catch (e) {
    if (reservedBytes > 0 && reservedUserId) {
      await releaseDailyUploadBytes(reservedUserId, reservedBytes);
    }
    if (e instanceof DailyUploadQuotaError) {
      return NextResponse.json({ error: e.message }, { status: 429 });
    }
    console.error(e);
    const msg = e instanceof Error ? e.message : "업로드에 실패했습니다.";
    return NextResponse.json({ error: msg.length < 400 ? msg : "업로드에 실패했습니다." }, { status: 500 });
  }
}
