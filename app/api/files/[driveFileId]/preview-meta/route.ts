import { NextResponse } from "next/server";
import { after } from "next/server";
import { getAppSession } from "@/auth";
import { getDriveV3, sanitizeDriveFileId } from "@/lib/google-drive-admin";
import prisma from "@/lib/prisma";
import { classifyForPreview } from "@/lib/files/preview-type";
import {
  assertUserCanAccessDriveAttachment,
  FilePreviewForbiddenError,
  FilePreviewNotFoundError,
  parseAttachmentPreviewContext,
} from "@/lib/files/preview-access";
import { ensureTemporaryAnyoneReaderForPreview, revokeExpiredDrivePreviewPermissions } from "@/lib/files/drive-temp-permission";
import { runHwpToPdfConversionJob } from "@/lib/files/hwp-convert-job";

export const runtime = "nodejs";
export const maxDuration = 60;

function buildQuery(driveFileId: string, ctx: { type: string; postId?: string; projectId?: string }) {
  const p = new URLSearchParams();
  p.set("context", ctx.type);
  if (ctx.postId) p.set("postId", ctx.postId);
  if (ctx.projectId) p.set("projectId", ctx.projectId);
  return p.toString();
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
    await revokeExpiredDrivePreviewPermissions(drive);

    let meta: { name?: string | null; mimeType?: string | null };
    try {
      const g = await drive.files.get({
        fileId: driveFileId,
        fields: "name,mimeType",
        supportsAllDrives: true,
      });
      meta = { name: g.data.name, mimeType: g.data.mimeType };
    } catch {
      return NextResponse.json({ error: "Drive에서 파일을 찾을 수 없습니다." }, { status: 404 });
    }

    const originalName = String(meta.name ?? "file");
    const mimeType = String(meta.mimeType ?? "application/octet-stream");
    const previewType = classifyForPreview(mimeType, originalName);

    const q = buildQuery(driveFileId, pctx);
    const previewUrl = `/api/files/${encodeURIComponent(driveFileId)}/preview?${q}`;
    const downloadUrl = `/api/files/${encodeURIComponent(driveFileId)}/download?${q}`;

    if (previewType === "DRIVE_EMBED") {
      await ensureTemporaryAnyoneReaderForPreview(drive, driveFileId);
      return NextResponse.json({
        driveFileId,
        originalName,
        mimeType,
        previewType,
        conversionStatus: "NONE",
        conversionError: null,
        embedUrl: `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/preview`,
        previewUrl,
        downloadUrl,
      });
    }

    if (previewType === "CONVERTED_PDF") {
      let cache = await prisma.filePreviewCache.findUnique({ where: { driveFileId } });

      if (!cache) {
        try {
          cache = await prisma.filePreviewCache.create({
            data: {
              driveFileId,
              originalName,
              originalMime: mimeType,
              previewType: "CONVERTED_PDF",
              conversionStatus: "PENDING",
            },
          });
          after(() => {
            void runHwpToPdfConversionJob(driveFileId);
          });
        } catch (e: unknown) {
          const code = e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : "";
          if (code === "P2002") {
            cache = await prisma.filePreviewCache.findUnique({ where: { driveFileId } });
          } else {
            throw e;
          }
        }
      }
      if (!cache) {
        return NextResponse.json({ error: "변환 캐시를 준비하지 못했습니다." }, { status: 500 });
      }
      if (cache.conversionStatus === "FAILED" || cache.conversionStatus === "NONE") {
        await prisma.filePreviewCache.update({
          where: { driveFileId },
          data: {
            conversionStatus: "PENDING",
            conversionError: null,
            originalName,
            originalMime: mimeType,
            previewType: "CONVERTED_PDF",
          },
        });
        after(() => {
          void runHwpToPdfConversionJob(driveFileId);
        });
      }

      const fresh = await prisma.filePreviewCache.findUnique({ where: { driveFileId } });
      const st = fresh?.conversionStatus ?? "PENDING";

      if (st === "DONE") {
        return NextResponse.json({
          driveFileId,
          originalName,
          mimeType,
          previewType,
          conversionStatus: "DONE",
          conversionError: null,
          embedUrl: null,
          previewUrl,
          downloadUrl,
        });
      }

      if (st === "FAILED") {
        return NextResponse.json(
          {
            driveFileId,
            originalName,
            mimeType,
            previewType,
            conversionStatus: "FAILED",
            conversionError: fresh?.conversionError ?? null,
            embedUrl: null,
            previewUrl: null,
            downloadUrl,
          },
          { status: 422 }
        );
      }

      return NextResponse.json(
        {
          driveFileId,
          originalName,
          mimeType,
          previewType,
          conversionStatus: "PENDING",
          conversionError: null,
          embedUrl: null,
          previewUrl: null,
          downloadUrl,
        },
        { status: 202 }
      );
    }

    return NextResponse.json({
      driveFileId,
      originalName,
      mimeType,
      previewType,
      conversionStatus: "NONE",
      conversionError: null,
      embedUrl: null,
      previewUrl,
      downloadUrl,
    });
  } catch (e) {
    if (e instanceof FilePreviewForbiddenError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (e instanceof FilePreviewNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[files/preview-meta]", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
