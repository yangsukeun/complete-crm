import { NextResponse } from "next/server";
import { Readable } from "stream";
import { getAppSession } from "@/auth";
import { getDriveV3, sanitizeDriveFileId } from "@/lib/google-drive-admin";
import prisma from "@/lib/prisma";
import { classifyForPreview } from "@/lib/files/preview-type";
import { inlinePreviewHeaders } from "@/lib/files/inline-preview-headers";
import {
  assertUserCanAccessDriveAttachment,
  FilePreviewForbiddenError,
  FilePreviewNotFoundError,
  parseAttachmentPreviewContext,
} from "@/lib/files/preview-access";

export const runtime = "nodejs";
export const maxDuration = 120;

function sanitizeDownloadName(name: string): string {
  const n = name.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200);
  return n.length > 0 ? n : "download";
}

export async function GET(req: Request, ctx: { params: Promise<{ driveFileId: string }> }) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { driveFileId: rawId } = await ctx.params;
    const driveFileId = sanitizeDriveFileId(decodeURIComponent(rawId));
    if (!driveFileId) {
      return NextResponse.json({ error: "잘못된 파일 ID" }, { status: 400 });
    }

    const sp = new URL(req.url).searchParams;
    const pctx = parseAttachmentPreviewContext(sp);
    if (!pctx) {
      return NextResponse.json({ error: "context·postId 또는 projectId가 필요합니다." }, { status: 400 });
    }

    await assertUserCanAccessDriveAttachment(
      session.user.id,
      session.user.role,
      session.user.email ?? undefined,
      driveFileId,
      pctx
    );

    const drive = getDriveV3();
    const g = await drive.files.get({
      fileId: driveFileId,
      fields: "name,mimeType,size",
      supportsAllDrives: true,
    });
    const originalName = sanitizeDownloadName(String(g.data.name ?? "file"));
    const mimeType = String(g.data.mimeType ?? "application/octet-stream");
    const size = g.data.size != null ? String(g.data.size) : null;

    const previewType = classifyForPreview(mimeType, originalName);

    if (previewType === "DRIVE_EMBED") {
      return NextResponse.redirect(
        `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/preview`,
        302
      );
    }

    let streamFileId = driveFileId;
    if (previewType === "CONVERTED_PDF") {
      const cache = await prisma.filePreviewCache.findUnique({ where: { driveFileId } });
      if (!cache || cache.conversionStatus !== "DONE" || !cache.convertedDriveId) {
        return NextResponse.json({ status: "CONVERTING_OR_FAILED" }, { status: 409 });
      }
      streamFileId = cache.convertedDriveId;
    }

    if (previewType === "UNSUPPORTED") {
      return NextResponse.json({ error: "Unsupported" }, { status: 415 });
    }

    const mediaRes: unknown = await drive.files.get(
      { fileId: streamFileId, alt: "media", supportsAllDrives: true },
      { responseType: "stream" }
    );
    const nodeStream = (mediaRes as { data?: NodeJS.ReadableStream }).data;
    if (!nodeStream || typeof (nodeStream as Readable).pipe !== "function") {
      return NextResponse.json({ error: "스트림 생성 실패" }, { status: 500 });
    }
    const webStream = Readable.toWeb(nodeStream as Readable) as unknown as ReadableStream;

    const outMime = previewType === "CONVERTED_PDF" ? "application/pdf" : mimeType;
    const outName =
      previewType === "CONVERTED_PDF"
        ? `${originalName.replace(/\.[^.]+$/i, "")}.pdf`
        : originalName;
    const headers = inlinePreviewHeaders(outName, outMime);

    return new Response(webStream, {
      headers: {
        ...headers,
        ...(size && streamFileId === driveFileId ? { "Content-Length": size } : {}),
      },
    });
  } catch (e) {
    if (e instanceof FilePreviewForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (e instanceof FilePreviewNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[files/preview]", e);
    return NextResponse.json({ error: "미리보기 실패" }, { status: 500 });
  }
}
