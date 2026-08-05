import "server-only";

import type { drive_v3 } from "googleapis";
import prisma from "@/lib/prisma";
import { getDriveV3 } from "@/lib/google-drive-admin";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const MAX_DEPTH = 5;

export type DriveSyncStats = {
  upserted: number;
  folders: number;
  removed: number;
  totalInDb: number;
  rootFolderId: string;
  syncedAt: string;
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
  parentDbId: string | null,
  depth: number,
  stats: Pick<DriveSyncStats, "upserted" | "folders" | "removed">
): Promise<void> {
  if (depth > MAX_DEPTH) return;

  const files = await listChildren(drive, googleFolderId, sharedDriveId);
  console.log("[sync] listChildren", {
    depth,
    parentPrefix: googleFolderId.slice(0, 8) + "…",
    count: files.length,
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
        driveModifiedAt: file.modifiedTime ? new Date(file.modifiedTime) : null,
        lastSyncedAt: new Date(),
      },
    });

    stats.upserted += 1;
    if (isFolder) {
      stats.folders += 1;
      await syncFolder(drive, file.id, sharedDriveId, dbFile.id, depth + 1, stats);
    }
  }

  const orphans = await prisma.driveFile.findMany({
    where: {
      driveFolderId: googleFolderId,
      source: "google_drive",
      ...(driveIds.length > 0 ? { NOT: { driveFileId: { in: driveIds } } } : {}),
    },
    select: { id: true },
  });

  for (const orphan of orphans) {
    await deleteDriveFileTree(orphan.id);
    stats.removed += 1;
  }
}

/** Google Drive 공유 드라이브 → Prisma DriveFile 동기화 (세션 무관, cron/API 공용) */
export async function syncGoogleDriveToDb(): Promise<DriveSyncStats> {
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  console.log("[sync] syncGoogleDriveToDb 진입 (shared drive)", {
    hasFolderId: Boolean(rootFolderId),
    folderIdPrefix: rootFolderId ? `${rootFolderId.slice(0, 6)}…` : null,
    hasSaJson: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()),
    hasSaEmail: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim()),
  });

  if (!rootFolderId) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID가 설정되어 있지 않습니다.");
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
    // GOOGLE_DRIVE_FOLDER_ID = 공유 드라이브 ID (루트)
    console.log("[sync] 공유 드라이브 루트 동기화 시작", rootFolderId.slice(0, 8) + "…");
    await syncFolder(drive, rootFolderId, rootFolderId, null, 0, stats);
  } catch (e) {
    console.error("[sync] files.list/upsert 단계 실패", e);
    throw e;
  }

  const totalInDb = await prisma.driveFile.count({ where: { source: "google_drive" } });
  console.log("[sync] DB 반영 완료", { ...stats, totalInDb });

  return {
    ...stats,
    totalInDb,
    rootFolderId,
    syncedAt: new Date().toISOString(),
  };
}
