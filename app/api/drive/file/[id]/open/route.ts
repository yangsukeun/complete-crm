import { NextResponse, after } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { assertExplorerConfigured } from "@/lib/drive/explorer-folder-guard";
import {
  assertCanAccessDriveFileId,
  loadDriveAccessActor,
} from "@/lib/drive/folder-access";
import { officeMimeToRepair, resolveDriveOpenUrl } from "@/lib/drive/google-office-open";
import { getDriveV3 } from "@/lib/google-drive-admin";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * POST /api/drive/file/[id]/open
 * CRM 부서 폴더 가드만 확인 후 webViewLink 반환.
 * (파일별 JIT permissions.create 는 중단 — 폴더 단위 DriveTeamShare 동기화로 대체)
 */
export async function POST(_req: Request, ctx: RouteCtx) {
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

    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true },
    });

    const row = await prisma.driveFile.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        name: true,
        mimeType: true,
        driveFileId: true,
        webViewLink: true,
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
        { error: "폴더는 탐색기에서 직접 열어 주세요." },
        { status: 400 }
      );
    }
    if (row.rootId !== explorerRootId) {
      return NextResponse.json(
        { error: "탐색기 공유 드라이브 파일만 열 수 있습니다." },
        { status: 403 }
      );
    }
    if (!row.driveFileId) {
      return NextResponse.json(
        { error: "Google Drive 파일 ID가 없습니다." },
        { status: 400 }
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

    const desiredMime = officeMimeToRepair(row.name, row.mimeType);
    let storedLink = row.webViewLink;
    if (desiredMime) {
      try {
        const drive = getDriveV3();
        const updated = await drive.files.update({
          fileId: row.driveFileId,
          supportsAllDrives: true,
          requestBody: { mimeType: desiredMime },
          fields: "mimeType, webViewLink",
        });
        storedLink = updated.data.webViewLink ?? storedLink;
        after(() =>
          prisma.driveFile
            .update({
              where: { id: row.id },
              data: {
                mimeType: desiredMime,
                webViewLink: storedLink,
              },
            })
            .catch((e) => console.error("[drive/file open] db mime patch", e))
        );
      } catch (e) {
        console.error("[drive/file open] google mime patch", e);
        after(() =>
          prisma.driveFile
            .update({
              where: { id: row.id },
              data: { mimeType: desiredMime },
            })
            .catch((err) => console.error("[drive/file open] db mime patch", err))
        );
      }
    }

    const webViewLink = resolveDriveOpenUrl({
      driveFileId: row.driveFileId,
      fileName: row.name,
      mimeType: desiredMime || row.mimeType,
      webViewLink: storedLink,
    });

    const userEmail = dbUser?.email?.trim() ?? "";
    return NextResponse.json({
      ok: true,
      webViewLink,
      driveFileId: row.driveFileId,
      name: row.name,
      accountHint: userEmail
        ? `CRM에 등록된 이메일(${userEmail})로 구글 로그인 후 다시 열어주세요.`
        : undefined,
      userEmail: userEmail || undefined,
    });
  } catch (e) {
    console.error("[drive/file open]", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg.length < 400 ? msg : "열기 실패" }, { status: 500 });
  }
}
