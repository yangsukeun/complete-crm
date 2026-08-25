import "server-only";

import type { drive_v3 } from "googleapis";
import prisma from "@/lib/prisma";
import { getDriveV3 } from "@/lib/google-drive-admin";
import { getDriveExplorerRootId, isDriveExplorerFolderConfigured } from "@/lib/drive/explorer-root";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const MAX_DEPTH = 5;
/** 서버리스 인스턴스 내 동일 폴더 Drive 호출 가드 (DB lastSyncedAt 보조) */
const folderSyncGuardMs = new Map<string, number>();
const SERVER_FOLDER_THROTTLE_MS = 10_000;

export type DriveSyncStats = {
  upserted: number;
  folders: number;
  removed: number;
  totalInDb: number;
  rootFolderId: string;
  explorerConfigured: boolean;
  syncedAt: string;
  /** Drive API 호출 없이 DB만 반환한 경우 */
  skippedDrive?: boolean;
};

function escapeDriveQueryValue(id: string): string {
  return id.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * 공유 드라이브(Shared Drive) 하위 목록.
 * - supportsAllDrives / includeItemsFromAllDrives 필수
 * - corpora=drive + driveId = 공유 드라이브 ID (루트 env)
 * - q 의 parents = 현재 탐색 중인 폴더 ID (루트면 공유 드라이브 ID와 동일)
 */
async function listChildren(
  drive: drive_v3.Drive,
  parentGoogleId: string,
  sharedDriveId: string
): Promise<drive_v3.Schema$File[]> {
  const all: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;
  const q = `'${escapeDriveQueryValue(parentGoogleId)}' in parents and trashed = false`;

  do {
    const response = await drive.files.list({
      q,
      fields:
        "nextPageToken, files(id, name, mimeType, size, webViewLink, webContentLink, thumbnailLink, modifiedTime, parents)",
      orderBy: "folder,name",
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: "drive",
      driveId: sharedDriveId,
    });
    if (response.data.files?.length) all.push(...response.data.files);
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return all;
}

async function deleteDriveFileTree(id: string): Promise<void> {
  const children = await prisma.driveFile.findMany({
    where: { parentId: id },
    select: { id: true },
  });
  for (const child of children) {
    await deleteDriveFileTree(child.id);
  }
  await prisma.driveFile.delete({ where: { id } }).catch(() => {
    /* already gone */
  });
}

async function syncFolder(
  drive: drive_v3.Drive,
  googleFolderId: string,
  sharedDriveId: string,
  rootId: string,
  parentDbId: string | null,
  depth: number,
  stats: Pick<DriveSyncStats, "upserted" | "folders" | "removed">,
  /** false면 직계 자식만 (하위 폴더 재귀 없음) — UI "이 폴더 새로고침" */
  recurse = true
): Promise<void> {
  if (depth > MAX_DEPTH) return;

  const files = await listChildren(drive, googleFolderId, sharedDriveId);
  console.log("[sync] listChildren", {
    depth,
    parentPrefix: googleFolderId.slice(0, 8) + "…",
    rootPrefix: rootId.slice(0, 8) + "…",
    count: files.length,
    recurse,
  });

  const driveIds = files.map((f) => f.id).filter((id): id is string => Boolean(id));

  for (const file of files) {
    if (!file.id || !file.name) continue;
    const isFolder = file.mimeType === FOLDER_MIME;

    const dbFile = await prisma.driveFile.upsert({
      where: { driveFileId: file.id },
      create: {
        driveFileId: file.id,
        driveFolderId: googleFolderId,
        rootId,
        name: file.name,
        mimeType: file.mimeType ?? null,
        size: file.size != null ? BigInt(file.size) : null,
        webViewLink: file.webViewLink ?? null,
        webContentLink: file.webContentLink ?? null,
        thumbnailLink: file.thumbnailLink ?? null,
        isFolder,
        parentId: parentDbId,
        source: "google_drive",
        driveModifiedAt: file.modifiedTime ? new Date(file.modifiedTime) : null,
        lastSyncedAt: new Date(),
      },
      update: {
        name: file.name,
        mimeType: file.mimeType ?? null,
        size: file.size != null ? BigInt(file.size) : null,
        webViewLink: file.webViewLink ?? null,
        webContentLink: file.webContentLink ?? null,
        thumbnailLink: file.thumbnailLink ?? null,
        isFolder,
        parentId: parentDbId,
        driveFolderId: googleFolderId,
        rootId,
        driveModifiedAt: file.modifiedTime ? new Date(file.modifiedTime) : null,
        lastSyncedAt: new Date(),
      },
    });

    stats.upserted += 1;
    if (isFolder) {
      stats.folders += 1;
      if (recurse) {
        await syncFolder(drive, file.id, sharedDriveId, rootId, dbFile.id, depth + 1, stats, true);
      }
    }
  }

  /** 같은 루트·같은 부모 아래에서만 고아 정리 — soft-trash·다른 드라이브는 건드리지 않음 */
  const orphans = await prisma.driveFile.findMany({
    where: {
      rootId,
      driveFolderId: googleFolderId,
      source: "google_drive",
      trashed: false,
      ...(driveIds.length > 0 ? { NOT: { driveFileId: { in: driveIds } } } : {}),
    },
    select: { id: true },
  });

  for (const orphan of orphans) {
    await deleteDriveFileTree(orphan.id);
    stats.removed += 1;
  }
}

/**
 * 현재 폴더(직계 자식)만 Drive→DB 반영. 전체 트리는 크론(syncGoogleDriveToDb)이 담당.
 * - googleFolderId 없으면 탐색기 루트
 * - parentDbId: DriveFile.id (루트면 null)
 * - force 아니면 동일 폴더 10초 내 lastSyncedAt이 있으면 Drive API 스킵
 */
export async function syncExplorerFolderOnly(opts: {
  googleFolderId?: string | null;
  parentDbId?: string | null;
  force?: boolean;
}): Promise<DriveSyncStats> {
  const rootFolderId = getDriveExplorerRootId();
  const explorerConfigured = isDriveExplorerFolderConfigured();
  if (!rootFolderId) {
    throw new Error(
      "GOOGLE_DRIVE_EXPLORER_FOLDER_ID 또는 GOOGLE_DRIVE_FOLDER_ID가 설정되어 있지 않습니다."
    );
  }

  const googleFolderId = opts.googleFolderId?.trim() || rootFolderId;
  let parentDbId: string | null =
    opts.parentDbId === undefined ? null : opts.parentDbId;

  if (googleFolderId !== rootFolderId) {
    const folder = await prisma.driveFile.findFirst({
      where: {
        driveFileId: googleFolderId,
        isFolder: true,
        rootId: rootFolderId,
        source: "google_drive",
      },
      select: { id: true, lastSyncedAt: true },
    });
    if (!folder) {
      throw new Error("탐색기 공유 드라이브 하위 폴더만 새로고침할 수 있습니다.");
    }
    parentDbId = folder.id;
  } else {
    parentDbId = null;
  }

  const SERVER_THROTTLE_MS = SERVER_FOLDER_THROTTLE_MS;
  if (!opts.force) {
    const memTs = folderSyncGuardMs.get(googleFolderId) ?? 0;
    const latestChild = await prisma.driveFile.findFirst({
      where: {
        source: "google_drive",
        rootId: rootFolderId,
        driveFolderId: googleFolderId,
        lastSyncedAt: { not: null },
      },
      orderBy: { lastSyncedAt: "desc" },
      select: { lastSyncedAt: true },
    });
    const parentSelf =
      googleFolderId !== rootFolderId
        ? await prisma.driveFile.findFirst({
            where: { driveFileId: googleFolderId, source: "google_drive" },
            select: { lastSyncedAt: true },
          })
        : null;
    const dbTs = Math.max(
      latestChild?.lastSyncedAt?.getTime() ?? 0,
      parentSelf?.lastSyncedAt?.getTime() ?? 0
    );
    const ts = Math.max(memTs, dbTs);
    if (ts > 0 && Date.now() - ts < SERVER_THROTTLE_MS) {
      const totalInDb = await prisma.driveFile.count({
        where: { source: "google_drive", rootId: rootFolderId, driveFolderId: googleFolderId },
      });
      console.log("[sync] folder-only SKIP drive (10s throttle)", {
        googlePrefix: googleFolderId.slice(0, 8) + "…",
        ageMs: Date.now() - ts,
        totalInDb,
      });
      return {
        upserted: 0,
        folders: 0,
        removed: 0,
        totalInDb,
        rootFolderId,
        explorerConfigured,
        syncedAt: new Date().toISOString(),
        skippedDrive: true,
      };
    }
  }

  const drive = getDriveV3();
  const stats = { upserted: 0, folders: 0, removed: 0 };
  const t0 = Date.now();
  await syncFolder(drive, googleFolderId, rootFolderId, rootFolderId, parentDbId, 0, stats, false);
  folderSyncGuardMs.set(googleFolderId, Date.now());

  // 부모 폴더 레코드에도 lastSyncedAt 갱신 → 빈 폴더 재호출 스로틀에 사용
  if (parentDbId) {
    await prisma.driveFile
      .update({
        where: { id: parentDbId },
        data: { lastSyncedAt: new Date() },
      })
      .catch(() => {
        /* ignore */
      });
  }

  const totalInDb = await prisma.driveFile.count({
    where: { source: "google_drive", rootId: rootFolderId, driveFolderId: googleFolderId },
  });
  console.log("[sync] folder-only 완료", {
    ...stats,
    totalInDb,
    elapsedMs: Date.now() - t0,
    skippedDrive: false,
  });

  return {
    ...stats,
    totalInDb,
    rootFolderId,
    explorerConfigured,
    syncedAt: new Date().toISOString(),
    skippedDrive: false,
  };
}

/**
 * 탐색기 루트(GOOGLE_DRIVE_EXPLORER_FOLDER_ID → 폴백 FOLDER_ID) → Prisma DriveFile 동기화.
 * 업로드 전용 GOOGLE_DRIVE_FOLDER_ID 값은 변경하지 않음.
 */
export async function syncGoogleDriveToDb(): Promise<DriveSyncStats> {
  const rootFolderId = getDriveExplorerRootId();
  const explorerConfigured = isDriveExplorerFolderConfigured();
  console.log("[sync] syncGoogleDriveToDb 진입 (shared drive)", {
    explorerConfigured,
    hasRootId: Boolean(rootFolderId),
    rootIdPrefix: rootFolderId ? `${rootFolderId.slice(0, 6)}…` : null,
    hasSaJson: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()),
    hasSaEmail: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim()),
  });

  if (!rootFolderId) {
    throw new Error(
      "GOOGLE_DRIVE_EXPLORER_FOLDER_ID 또는 GOOGLE_DRIVE_FOLDER_ID가 설정되어 있지 않습니다."
    );
  }

  let drive: ReturnType<typeof getDriveV3>;
  try {
    drive = getDriveV3();
    console.log("[sync] Drive 클라이언트 생성 OK");
  } catch (e) {
    console.error("[sync] Drive 클라이언트 생성 실패", e);
    throw e;
  }

  const stats = { upserted: 0, folders: 0, removed: 0 };
  try {
    console.log(
      "[sync] 탐색기 루트 동기화 시작",
      rootFolderId.slice(0, 8) + "…",
      explorerConfigured ? "(EXPLORER)" : "(FOLDER_ID 폴백)"
    );
    await syncFolder(drive, rootFolderId, rootFolderId, rootFolderId, null, 0, stats);
  } catch (e) {
    console.error("[sync] files.list/upsert 단계 실패", e);
    throw e;
  }

  const totalInDb = await prisma.driveFile.count({
    where: { source: "google_drive", rootId: rootFolderId },
  });
  console.log("[sync] DB 반영 완료", { ...stats, totalInDb, rootFolderId: rootFolderId.slice(0, 8) + "…" });

  return {
    ...stats,
    totalInDb,
    rootFolderId,
    explorerConfigured,
    syncedAt: new Date().toISOString(),
  };
}
