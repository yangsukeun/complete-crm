import { NextResponse } from "next/server";
import JSZip from "jszip";
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
  sanitizeDownloadName,
} from "@/lib/drive/explorer-download";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILES = 30;

/**
 * POST /api/drive/files/download
 * body: { ids: string[] }
 * - 파일 1개: 단건 스트림
 * - 여러 개: zip
 * - 폴더는 건너뜀
 */
export async function POST(req: Request) {
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

    const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
    const ids = Array.isArray(body?.ids)
      ? [...new Set(body!.ids.filter((x): x is string => typeof x === "string" && x.trim().length > 0))]
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "다운로드할 파일을 선택하세요." }, { status: 400 });
    }
    if (ids.length > MAX_FILES) {
      return NextResponse.json(
        { error: `한 번에 ${MAX_FILES}개까지 다운로드할 수 있습니다.` },
        { status: 400 }
      );
    }

    const actor = await loadDriveAccessActor(session.user.id);
    if (!actor) {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 401 });
    }

    const rows = await prisma.driveFile.findMany({
      where: { id: { in: ids }, trashed: false, rootId: explorerRootId },
      select: {
        id: true,
        name: true,
        mimeType: true,
        driveFileId: true,
        isFolder: true,
      },
    });

    const files = rows.filter((r) => !r.isFolder && r.driveFileId);
    const folderCount = rows.filter((r) => r.isFolder).length;
    if (files.length === 0) {
      return NextResponse.json(
        {
          error:
            folderCount > 0
              ? "폴더는 다운로드할 수 없습니다. 파일을 선택해 주세요."
              : "다운로드할 파일을 찾을 수 없습니다.",
        },
        { status: 400 }
      );
    }

    for (const row of files) {
      const access = await assertCanAccessDriveFileId(actor, row.id);
      if (!access.ok) {
        return NextResponse.json(
          { error: `「${row.name}」: ${access.error}` },
          { status: access.status }
        );
      }
    }

    if (files.length === 1) {
      const row = files[0]!;
      const payload = await fetchExplorerFileDownload(row.driveFileId!, {
        nameHint: row.name,
        mimeHint: row.mimeType,
      });
      return new Response(new Uint8Array(payload.buffer), {
        headers: {
          ...attachmentDownloadHeaders(payload.fileName, payload.mimeType),
          "Content-Length": String(payload.buffer.length),
        },
      });
    }

    const zip = new JSZip();
    const usedNames = new Map<string, number>();
    const errors: string[] = [];

    for (const row of files) {
      try {
        const payload = await fetchExplorerFileDownload(row.driveFileId!, {
          nameHint: row.name,
          mimeHint: row.mimeType,
        });
        let name = payload.fileName;
        const n = usedNames.get(name) ?? 0;
        usedNames.set(name, n + 1);
        if (n > 0) {
          const dot = name.lastIndexOf(".");
          name =
            dot > 0
              ? `${name.slice(0, dot)} (${n})${name.slice(dot)}`
              : `${name} (${n})`;
        }
        zip.file(name, payload.buffer);
      } catch (e) {
        console.error("[drive/files/download]", row.id, e);
        errors.push(row.name);
      }
    }

    if (Object.keys(zip.files).length === 0) {
      return NextResponse.json(
        {
          error:
            errors.length > 0
              ? `다운로드 실패: ${errors.slice(0, 3).join(", ")}`
              : "다운로드할 파일이 없습니다.",
        },
        { status: 400 }
      );
    }

    const zipBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const stamp = new Date().toISOString().slice(0, 10);
    const zipName = sanitizeDownloadName(`drive-${stamp}.zip`);

    return new Response(new Uint8Array(zipBuf), {
      headers: {
        ...attachmentDownloadHeaders(zipName, "application/zip"),
        "Content-Length": String(zipBuf.length),
        ...(errors.length > 0
          ? { "X-Drive-Download-Errors": String(errors.length) }
          : {}),
        ...(folderCount > 0 ? { "X-Drive-Skipped-Folders": String(folderCount) } : {}),
      },
    });
  } catch (e) {
    console.error("[drive/files/download]", e);
    return NextResponse.json({ error: "다운로드에 실패했습니다." }, { status: 500 });
  }
}
