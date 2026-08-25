import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { getOrCreateDriveJwtAuth } from "@/lib/google-drive-admin";
import { resolveExplorerUploadFolder } from "@/lib/drive/explorer-folder-guard";
import {
  assertCanAccessDriveFileId,
  loadDriveAccessActor,
} from "@/lib/drive/folder-access";
import {
  assertExplorerUploadSize,
  EXPLORER_UPLOAD_CHUNK_BYTES,
} from "@/lib/drive/explorer-upload-limits";
import { sanitizeUploadDisplayName, isUploadFileNameBlocked } from "@/lib/upload-policy";
import { signExplorerUploadSession } from "@/lib/drive/upload-session-token";
import {
  DailyUploadQuotaError,
  reserveDailyUploadBytes,
} from "@/lib/upload-daily-quota";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/drive/upload-session
 * 서비스계정으로 Google resumable 세션 생성 후, 클라이언트 청크 PUT용 토큰 반환.
 * (브라우저→Google 직접 PUT은 SA 세션 CORS로 불가 → 동일 출처 /upload-chunk 로 프록시)
 */
export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const userId = session.user.id;

    const body = (await req.json().catch(() => null)) as {
      name?: unknown;
      parentFolderId?: unknown;
      mimeType?: unknown;
      size?: unknown;
    } | null;

    const rawName = typeof body?.name === "string" ? body.name : "";
    const parentFolderId =
      typeof body?.parentFolderId === "string" ? body.parentFolderId.trim() : "";
    const mimeType =
      typeof body?.mimeType === "string" && body.mimeType.trim()
        ? body.mimeType.trim()
        : "application/octet-stream";
    const size = typeof body?.size === "number" ? body.size : Number(body?.size);

    if (!parentFolderId) {
      return NextResponse.json(
        { error: "대상 폴더(parentFolderId)가 필요합니다." },
        { status: 400 }
      );
    }
    if (isUploadFileNameBlocked(rawName)) {
      return NextResponse.json(
        { error: "실행 파일은 보안상 업로드할 수 없습니다. 압축 파일(.zip)로 보내주세요." },
        { status: 400 }
      );
    }
    const sizeCheck = assertExplorerUploadSize(size);
    if (!sizeCheck.ok) {
      return NextResponse.json({ error: sizeCheck.error }, { status: 400 });
    }

    const displayName = sanitizeUploadDisplayName(rawName);

    const resolved = await resolveExplorerUploadFolder(parentFolderId);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const { folder, explorerRootId } = resolved;

    const actor = await loadDriveAccessActor(userId);
    if (!actor) {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 401 });
    }
    const access = await assertCanAccessDriveFileId(actor, folder.id);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    try {
      await reserveDailyUploadBytes(userId, size);
    } catch (quotaErr) {
      if (quotaErr instanceof DailyUploadQuotaError) {
        return NextResponse.json({ error: quotaErr.message }, { status: 429 });
      }
      console.error("[upload-session] daily quota reserve failed — continue", quotaErr);
    }

    const jwt = getOrCreateDriveJwtAuth();
    const tokenRes = await jwt.getAccessToken();
    const accessToken = tokenRes?.token;
    if (!accessToken) {
      return NextResponse.json({ error: "Drive 인증에 실패했습니다." }, { status: 500 });
    }

    const initRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": mimeType,
          "X-Upload-Content-Length": String(size),
        },
        body: JSON.stringify({
          name: displayName,
          parents: [folder.driveFileId],
        }),
      }
    );

    if (!initRes.ok) {
      const errText = await initRes.text().catch(() => "");
      console.error("[upload-session] google init failed", initRes.status, errText.slice(0, 500));
      return NextResponse.json(
        { error: "업로드 세션을 만들지 못했습니다." },
        { status: 502 }
      );
    }

    const googleUploadUrl = initRes.headers.get("location") || initRes.headers.get("Location");
    if (!googleUploadUrl) {
      return NextResponse.json(
        { error: "Google 업로드 URL을 받지 못했습니다." },
        { status: 502 }
      );
    }

    const sessionToken = signExplorerUploadSession({
      v: 1,
      uid: userId,
      gUrl: googleUploadUrl,
      parentDbId: folder.id,
      parentDriveId: folder.driveFileId,
      rootId: explorerRootId,
      name: displayName,
      mime: mimeType,
      size,
      exp: Date.now() + 2 * 60 * 60 * 1000,
    });

    // 동일 출처 청크 프록시 (브라우저→Google 직접 PUT은 SA 세션 CORS로 불가)
    return NextResponse.json({
      ok: true,
      sessionToken,
      uploadUrl: "/api/drive/upload-chunk",
      chunkSize: EXPLORER_UPLOAD_CHUNK_BYTES,
      maxBytes: size,
      name: displayName,
      mimeType,
    });
  } catch (e) {
    console.error("[upload-session]", e);
    const msg = e instanceof Error ? e.message : "업로드 세션 생성 실패";
    return NextResponse.json(
      { error: msg.length < 400 ? msg : "업로드 세션 생성 실패" },
      { status: 500 }
    );
  }
}
