import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getDriveV3, getOrCreateDriveJwtAuth } from "@/lib/google-drive-admin";
import { assertExplorerConfigured } from "@/lib/drive/explorer-folder-guard";
import {
  assertCanAccessDriveFileId,
  loadDriveAccessActor,
} from "@/lib/drive/folder-access";
import {
  explorerThumbnailCacheKey,
  getCachedExplorerThumbnail,
  setCachedExplorerThumbnail,
} from "@/lib/drive/thumbnail-cache";
import {
  clampThumbnailWidth,
  withDriveThumbnailSize,
} from "@/lib/drive/thumbnail-link";

export const runtime = "nodejs";
export const maxDuration = 30;

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * GET /api/drive/thumbnail/[id]?w=256
 * 탐색기 DriveFile 썸네일 프록시 (폴더 접근 가드 + SA fetch + 캐시)
 */
export async function GET(req: Request, ctx: RouteCtx) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const configured = assertExplorerConfigured();
    if (!configured.ok) {
      return NextResponse.json({ error: configured.error }, { status: configured.status });
    }
    const { explorerRootId } = configured;

    const { id } = await ctx.params;
    const fileId = id?.trim();
    if (!fileId) {
      return NextResponse.json({ error: "파일 ID가 필요합니다." }, { status: 400 });
    }

    const url = new URL(req.url);
    const w = clampThumbnailWidth(url.searchParams.get("w"));
    const cacheKey = explorerThumbnailCacheKey(fileId, w);

    const cached = getCachedExplorerThumbnail(cacheKey);
    if (cached) {
      return new NextResponse(new Uint8Array(cached.body), {
        status: 200,
        headers: {
          "Content-Type": cached.contentType,
          "Cache-Control": "private, max-age=86400, immutable",
          "X-Content-Type-Options": "nosniff",
          "X-Thumb-Cache": "HIT",
        },
      });
    }

    const row = await prisma.driveFile.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        rootId: true,
        isFolder: true,
        trashed: true,
        thumbnailLink: true,
        mimeType: true,
        driveFileId: true,
      },
    });

    if (!row || row.trashed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (row.rootId !== explorerRootId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (row.isFolder) {
      return NextResponse.json({ error: "폴더는 썸네일이 없습니다." }, { status: 404 });
    }

    const actor = await loadDriveAccessActor(session.user.id);
    if (!actor) {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 401 });
    }
    const access = await assertCanAccessDriveFileId(actor, row.id);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    let thumbUrl = row.thumbnailLink?.trim() || "";
    if (!thumbUrl && row.driveFileId) {
      // 캐시에 없으면 Drive 메타 1회 조회 후 저장 (PDF·구글문서 등)
      try {
        const drive = getDriveV3();
        const meta = await drive.files.get({
          fileId: row.driveFileId,
          fields: "thumbnailLink",
          supportsAllDrives: true,
        });
        thumbUrl = meta.data.thumbnailLink?.trim() || "";
        if (thumbUrl) {
          await prisma.driveFile
            .update({
              where: { id: row.id },
              data: { thumbnailLink: thumbUrl },
            })
            .catch(() => {});
        }
      } catch {
        /* ignore — 404 */
      }
    }

    if (!thumbUrl) {
      return NextResponse.json({ error: "썸네일 없음" }, { status: 404 });
    }

    const sizedUrl = withDriveThumbnailSize(thumbUrl, w);
    const jwt = getOrCreateDriveJwtAuth();
    const tokenRes = await jwt.getAccessToken();
    const accessToken = tokenRes?.token;
    if (!accessToken) {
      return NextResponse.json({ error: "Drive 인증 실패" }, { status: 500 });
    }

    const gRes = await fetch(sizedUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: "follow",
    });

    if (!gRes.ok) {
      console.warn("[drive/thumbnail] google fetch", gRes.status, sizedUrl.slice(0, 80));
      return NextResponse.json({ error: "썸네일을 가져오지 못했습니다." }, { status: 404 });
    }

    const contentType = gRes.headers.get("content-type") || "image/jpeg";
    const ab = await gRes.arrayBuffer();
    const body = Buffer.from(ab);
    if (body.byteLength === 0) {
      return NextResponse.json({ error: "빈 썸네일" }, { status: 404 });
    }

    setCachedExplorerThumbnail(cacheKey, body, contentType);

    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
        "X-Thumb-Cache": "MISS",
      },
    });
  } catch (e) {
    console.error("[drive/thumbnail]", e);
    return NextResponse.json({ error: "썸네일 처리 실패" }, { status: 500 });
  }
}
