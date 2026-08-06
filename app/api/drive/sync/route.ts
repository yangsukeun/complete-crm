import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import {
  syncExplorerFolderOnly,
  syncGoogleDriveToDb,
} from "@/lib/drive/sync-from-google";

export const runtime = "nodejs";
export const maxDuration = 300;

function driveEnvDebug() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || "";
  const explorerId = process.env.GOOGLE_DRIVE_EXPLORER_FOLDER_ID?.trim() || "";
  const effectiveRoot = explorerId || folderId;
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() || "";
  const saEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || "";
  const saKey = process.env.GOOGLE_PRIVATE_KEY?.trim() || "";
  let saJsonValid: boolean | null = null;
  let saClientEmailPresent = false;
  if (saJson) {
    try {
      const parsed = JSON.parse(saJson) as { client_email?: string; private_key?: string };
      saJsonValid = Boolean(parsed.client_email && parsed.private_key);
      saClientEmailPresent = Boolean(parsed.client_email);
    } catch {
      saJsonValid = false;
    }
  }
  return {
    hasFolderId: Boolean(folderId),
    folderIdLength: folderId.length,
    folderIdPrefix: folderId ? `${folderId.slice(0, 6)}…` : null,
    hasExplorerFolderId: Boolean(explorerId),
    explorerFolderIdPrefix: explorerId ? `${explorerId.slice(0, 6)}…` : null,
    effectiveRootPrefix: effectiveRoot ? `${effectiveRoot.slice(0, 6)}…` : null,
    usingExplorerEnv: Boolean(explorerId),
    hasServiceAccountJson: Boolean(saJson),
    serviceAccountJsonLength: saJson.length,
    serviceAccountJsonValid: saJsonValid,
    saClientEmailPresent,
    hasServiceAccountEmail: Boolean(saEmail),
    hasPrivateKey: Boolean(saKey),
  };
}

/** POST — 기본: 현재 폴더만 새로고침. body.mode=full 이면 전체(크론과 동일) */
export async function POST(req: Request) {
  const dbg = driveEnvDebug();
  console.log("[sync] 시작");
  console.log(
    "[sync] 탐색기 루트:",
    dbg.effectiveRootPrefix,
    "EXPLORER=",
    dbg.hasExplorerFolderId,
    "FOLDER_ID 폴백=",
    !dbg.usingExplorerEnv && dbg.hasFolderId
  );

  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      console.warn("[sync] 401 로그인 필요");
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    let mode: "folder" | "full" = "folder";
    let googleFolderId: string | null = null;
    let parentDbId: string | null = null;
    let force = false;
    try {
      const body = (await req.json()) as {
        mode?: string;
        googleFolderId?: string | null;
        parentDbId?: string | null;
        force?: boolean;
      };
      if (body?.mode === "full") mode = "full";
      if (typeof body?.googleFolderId === "string" && body.googleFolderId.trim()) {
        googleFolderId = body.googleFolderId.trim();
      }
      if (typeof body?.parentDbId === "string" && body.parentDbId.trim()) {
        parentDbId = body.parentDbId.trim();
      }
      if (body?.force === true) force = true;
    } catch {
      /* empty body → folder-only at root */
    }

    const result =
      mode === "full"
        ? await syncGoogleDriveToDb()
        : await syncExplorerFolderOnly({ googleFolderId, parentDbId, force });

    console.log("[sync] 완료", {
      mode,
      force,
      skippedDrive: result.skippedDrive ?? false,
      upserted: result.upserted,
      folders: result.folders,
      removed: result.removed,
      totalInDb: result.totalInDb,
    });

    return NextResponse.json({
      ok: true,
      success: true,
      mode,
      message: result.skippedDrive
        ? "최근 동기화됨 — Drive 호출 생략"
        : mode === "full"
          ? `전체 동기화 완료: ${result.totalInDb}개`
          : `이 폴더 새로고침 완료: ${result.upserted}개 반영`,
      ...result,
      debug: dbg,
    });
  } catch (e) {
    console.error("[sync] 실패", e);
    const msg = e instanceof Error ? e.message : String(e);
    const status =
      /GOOGLE_DRIVE_EXPLORER_FOLDER_ID|GOOGLE_DRIVE_FOLDER_ID|서비스 계정|GOOGLE_SERVICE_ACCOUNT|JSON|하위 폴더/i.test(
        msg
      )
        ? 400
        : 500;
    return NextResponse.json(
      {
        error: msg,
        debug: dbg,
      },
      { status }
    );
  }
}

/** GET — DB 동기화 상태 + 환경변수 진단(값 본문 미노출) */
export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const dbg = driveEnvDebug();
    const [total, folders, files, last] = await Promise.all([
      prisma.driveFile.count({ where: { source: "google_drive" } }),
      prisma.driveFile.count({ where: { source: "google_drive", isFolder: true } }),
      prisma.driveFile.count({ where: { source: "google_drive", isFolder: false } }),
      prisma.driveFile.findFirst({
        where: { source: "google_drive", lastSyncedAt: { not: null } },
        orderBy: { lastSyncedAt: "desc" },
        select: { lastSyncedAt: true },
      }),
    ]);

    return NextResponse.json({
      configured:
        dbg.hasFolderId &&
        (dbg.hasServiceAccountJson || (dbg.hasServiceAccountEmail && dbg.hasPrivateKey)),
      total,
      folders,
      files,
      lastSyncedAt: last?.lastSyncedAt?.toISOString() ?? null,
      debug: dbg,
    });
  } catch (e) {
    console.error("[drive/sync] GET", e);
    return NextResponse.json({ error: "상태 조회 실패" }, { status: 500 });
  }
}
