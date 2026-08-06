import "server-only";

import prisma from "@/lib/prisma";
import {
  getDriveExplorerRootId,
  isDriveExplorerFolderConfigured,
} from "@/lib/drive/explorer-root";

export type ExplorerFolderTarget = {
  /** DriveFile DB id */
  id: string;
  driveFileId: string;
  rootId: string;
  name: string;
};

/**
 * targetFolderId(Google Drive 폴더 ID)가 EXPLORER root 하위 폴더인지 확인.
 * 임의 폴더 ID로 업로드/첨부 드라이브에 쓰는 것을 차단.
 */
export async function resolveExplorerUploadFolder(
  targetFolderId: string
): Promise<
  | { ok: true; folder: ExplorerFolderTarget; explorerRootId: string }
  | { ok: false; status: 400 | 403; error: string }
> {
  if (!isDriveExplorerFolderConfigured()) {
    return {
      ok: false,
      status: 400,
      error: "직원용 공유 드라이브(GOOGLE_DRIVE_EXPLORER_FOLDER_ID)가 설정되지 않았습니다.",
    };
  }

  const explorerRootId = getDriveExplorerRootId();
  if (!explorerRootId) {
    return {
      ok: false,
      status: 400,
      error: "GOOGLE_DRIVE_EXPLORER_FOLDER_ID가 설정되지 않았습니다.",
    };
  }

  const id = targetFolderId.trim();
  if (!id || id.length < 5) {
    return { ok: false, status: 400, error: "대상 폴더 ID가 올바르지 않습니다." };
  }

  const folder = await prisma.driveFile.findFirst({
    where: {
      driveFileId: id,
      isFolder: true,
      rootId: explorerRootId,
      source: "google_drive",
    },
    select: { id: true, driveFileId: true, rootId: true, name: true },
  });

  if (!folder?.driveFileId || !folder.rootId) {
    return {
      ok: false,
      status: 403,
      error: "탐색기 공유 드라이브 하위 폴더만 업로드할 수 있습니다.",
    };
  }

  return {
    ok: true,
    explorerRootId,
    folder: {
      id: folder.id,
      driveFileId: folder.driveFileId,
      rootId: folder.rootId,
      name: folder.name,
    },
  };
}

export function assertExplorerConfigured():
  | { ok: true; explorerRootId: string }
  | { ok: false; status: 400; error: string } {
  if (!isDriveExplorerFolderConfigured()) {
    return {
      ok: false,
      status: 400,
      error: "직원용 공유 드라이브(GOOGLE_DRIVE_EXPLORER_FOLDER_ID)가 설정되지 않았습니다.",
    };
  }
  const explorerRootId = getDriveExplorerRootId();
  if (!explorerRootId) {
    return {
      ok: false,
      status: 400,
      error: "GOOGLE_DRIVE_EXPLORER_FOLDER_ID가 설정되지 않았습니다.",
    };
  }
  return { ok: true, explorerRootId };
}
