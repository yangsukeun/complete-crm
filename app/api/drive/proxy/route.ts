import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { secureDownloadHeaders } from "@/lib/download-response-headers";
import { google } from "googleapis";
import { Readable } from "stream";

export const runtime = "nodejs";
export const maxDuration = 60;

function sanitizeFileId(id: string): string | null {
  const t = id.trim();
  if (!t || t.length < 5) return null;
  if (/[/\s#?&]/.test(t)) return null;
  return t;
}

function sanitizeDownloadName(name: string): string {
  const n = name.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200);
  return n.length > 0 ? n : "download";
}

function createDriveAuth(): InstanceType<typeof google.auth.JWT> {
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
}

/**
 * Google Drive 파일을 CRM 서버가 프록시로 스트리밍 다운로드.
 * GET /api/drive/proxy?fileId=xxx
 */
export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const fileIdRaw = searchParams.get("fileId") ?? "";
    const fileId = sanitizeFileId(fileIdRaw);
    if (!fileId) {
      return NextResponse.json({ error: "fileId가 올바르지 않습니다." }, { status: 400 });
    }

    const auth = createDriveAuth();
    const drive = google.drive({ version: "v3", auth });

    const metaRes: any = await drive.files.get({
      fileId,
      fields: "name,mimeType,size",
      supportsAllDrives: true,
    });
    const name = sanitizeDownloadName(String(metaRes?.data?.name ?? "download"));
    const mimeType = String(metaRes?.data?.mimeType ?? "application/octet-stream");
    const size = metaRes?.data?.size != null ? String(metaRes.data.size) : null;

    const mediaRes: any = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "stream" }
    );
    const nodeStream = mediaRes?.data as Readable;
    if (!nodeStream || typeof (nodeStream as any).pipe !== "function") {
      return NextResponse.json({ error: "파일 스트림을 생성할 수 없습니다." }, { status: 500 });
    }

    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

    const baseHeaders = secureDownloadHeaders(name, mimeType);
    return new Response(webStream, {
      headers: {
        ...baseHeaders,
        ...(size ? { "Content-Length": size } : {}),
      },
    });
  } catch (e) {
    console.error("[drive/proxy]", e);
    return NextResponse.json({ error: "다운로드에 실패했습니다." }, { status: 500 });
  }
}

