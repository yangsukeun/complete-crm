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

async function listChildren(
  drive: drive_v3.Drive,
  googleFolderId: string
): Promise<drive_v3.Schema$File[]> {
  const all: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;
  const q = `'${escapeDriveQueryValue(googleFolderId)}' in parents and trashed = false`;

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
  parentDbId: string | null,
  depth: number,
  stats: Pick<DriveSyncStats, "upserted" | "folders" | "removed">
): Promise<void> {
  if (depth > MAX_DEPTH) return;

  const files = await listChildren(drive, googleFolderId);
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
      await syncFolder(drive, file.id, dbFile.id, depth + 1, stats);
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

/** Google Drive 루트 폴더 → Prisma DriveFile 동기화 (세션 무관, cron/API 공용) */
export async function syncGoogleDriveToDb(): Promise<DriveSyncStats> {
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (!rootFolderId) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID가 설정되어 있지 않습니다.");
  }

  const drive = getDriveV3();
  const stats = { upserted: 0, folders: 0, removed: 0 };
  await syncFolder(drive, rootFolderId, null, 0, stats);

  const totalInDb = await prisma.driveFile.count({ where: { source: "google_drive" } });

  return {
    ...stats,
    totalInDb,
    rootFolderId,
    syncedAt: new Date().toISOString(),
  };
}
