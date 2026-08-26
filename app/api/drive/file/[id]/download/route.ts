import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { assertExplorerConfigured } from "@/lib/drive/explorer-folder-guard";
import {
  assertCanAccessDriveFileId,
  loadDriveAccessActor,
} from "@/lib/drive/folder-access";
import {
  attachmentDownloadHeaders,
  fetchExplorerFileDownload,
} from "@/lib/drive/explorer-download";

export const runtime = "nodejs";
export const maxDuration = 120;

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * GET /api/drive/file/[id]/download
 * 탐색기 파일 단건 다운로드 (Google Workspace는 docx/xlsx/pptx/pdf로 export)
 */
export async function GET(_req: Request, ctx: RouteCtx) {
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

    const row = await prisma.driveFile.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        name: true,
        mimeType: true,
        driveFileId: true,
        rootId: true,
        isFolder: true,
        trashed: true,
      },
    });

    if (!row || row.trashed) {
      return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
    }
    if (row.isFolder) {
      return NextResponse.json(
        { error: "폴더는 다운로드할 수 없습니다. 안의 파일을 선택해 주세요." },
        { status: 400 }
      );
    }
    if (row.rootId !== explorerRootId || !row.driveFileId) {
      return NextResponse.json(
        { error: "탐색기 공유 드라이브 파일만 다운로드할 수 있습니다." },
        { status: 403 }
      );
    }

    const actor = await loadDriveAccessActor(session.user.id);
    if (!actor) {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 401 });
    }
    const access = await assertCanAccessDriveFileId(actor, row.id);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const payload = await fetchExplorerFileDownload(row.driveFileId, {
      nameHint: row.name,
      mimeHint: row.mimeType,
    });

    return new Response(new Uint8Array(payload.buffer), {
      headers: {
        ...attachmentDownloadHeaders(payload.fileName, payload.mimeType),
        "Content-Length": String(payload.buffer.length),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "FOLDER_NOT_DOWNLOADABLE") {
      return NextResponse.json({ error: "폴더는 다운로드할 수 없습니다." }, { status: 400 });
    }
    if (msg === "UNSUPPORTED_GOOGLE_FILE") {
      return NextResponse.json(
        { error: "이 Google 파일 형식은 다운로드를 지원하지 않습니다." },
        { status: 400 }
      );
    }
    console.error("[drive/file/download]", e);
    return NextResponse.json({ error: "다운로드에 실패했습니다." }, { status: 500 });
  }
}
