import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { secureDownloadHeaders } from "@/lib/download-response-headers";
import { Readable } from "stream";
import { getDriveV3, sanitizeDriveFileId } from "@/lib/google-drive-admin";
import {
  assertUserCanAccessDriveAttachment,
  FilePreviewForbiddenError,
  FilePreviewNotFoundError,
  parseAttachmentPreviewContext,
} from "@/lib/files/preview-access";

export const runtime = "nodejs";
export const maxDuration = 60;

function sanitizeDownloadName(name: string): string {
  const n = name.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200);
  return n.length > 0 ? n : "download";
}

/**
 * Google Drive 파일을 CRM 서버가 프록시로 스트리밍 다운로드.
 * GET /api/drive/proxy?fileId=xxx&context=board|project|chat&postId|projectId|chatId=...
 */
export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const fileIdRaw = searchParams.get("fileId") ?? "";
    const fileId = sanitizeDriveFileId(fileIdRaw);
    if (!fileId) {
      return NextResponse.json({ error: "fileId가 올바르지 않습니다." }, { status: 400 });
    }

    const pctx = parseAttachmentPreviewContext(searchParams);
    if (!pctx) {
      return NextResponse.json(
        { error: "context와 postId|projectId|chatId가 필요합니다." },
        { status: 400 }
      );
    }

    await assertUserCanAccessDriveAttachment(
      session.user.id,
      session.user.role,
      session.user.email ?? undefined,
      fileId,
      pctx
    );

    const drive = getDriveV3();

    const metaRes: unknown = await drive.files.get({
      fileId,
      fields: "name,mimeType,size",
      supportsAllDrives: true,
    });
    const meta = metaRes as { data?: { name?: string; mimeType?: string; size?: string | number } };
    const name = sanitizeDownloadName(String(meta?.data?.name ?? "download"));
    const mimeType = String(meta?.data?.mimeType ?? "application/octet-stream");
    const size = meta?.data?.size != null ? String(meta.data.size) : null;

    const mediaRes: unknown = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "stream" }
    );
    const nodeStream = (mediaRes as { data?: NodeJS.ReadableStream }).data;
    if (!nodeStream || typeof (nodeStream as Readable).pipe !== "function") {
      return NextResponse.json({ error: "파일 스트림을 생성할 수 없습니다." }, { status: 500 });
    }

    const webStream = Readable.toWeb(nodeStream as Readable) as unknown as ReadableStream;

    const baseHeaders = secureDownloadHeaders(name, mimeType);
    return new Response(webStream, {
      headers: {
        ...baseHeaders,
        ...(size ? { "Content-Length": size } : {}),
      },
    });
  } catch (e) {
    if (e instanceof FilePreviewForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (e instanceof FilePreviewNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[drive/proxy]", e);
    return NextResponse.json({ error: "다운로드에 실패했습니다." }, { status: 500 });
  }
}
