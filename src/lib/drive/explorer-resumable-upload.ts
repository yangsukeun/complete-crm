/**
 * 탐색기 resumable 업로드 (클라이언트)
 * session → chunk PUT(프록시) → complete
 */

import {
  assertExplorerUploadSize,
  EXPLORER_UPLOAD_CHUNK_BYTES,
} from "@/lib/drive/explorer-upload-limits";
import { isUploadFileNameBlocked } from "@/lib/upload-policy";

export type ExplorerUploadedFile = {
  id: string;
  driveFileId: string;
  name: string;
  mimeType: string | null;
  size: string | null;
  isFolder: boolean;
  parentId: string | null;
  webViewLink: string | null;
  rootId?: string | null;
  createdBy?: string | null;
  driveModifiedAt: string | null;
};

export type UploadProgress = {
  bytesSent: number;
  bytesTotal: number;
  /** 0–100 */
  percent: number;
};

function googleFileIdFromBody(file: unknown): string | null {
  if (!file || typeof file !== "object") return null;
  const id = (file as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export async function uploadExplorerFileResumable(
  file: File,
  parentFolderId: string,
  opts?: {
    onProgress?: (p: UploadProgress) => void;
    signal?: AbortSignal;
  }
): Promise<ExplorerUploadedFile> {
  if (isUploadFileNameBlocked(file.name)) {
    throw new Error(
      "실행 파일은 보안상 업로드할 수 없습니다. 압축 파일(.zip)로 보내주세요."
    );
  }
  const sizeCheck = assertExplorerUploadSize(file.size);
  if (!sizeCheck.ok) throw new Error(sizeCheck.error);

  const sessionRes = await fetch("/api/drive/upload-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      parentFolderId,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    }),
    signal: opts?.signal,
  });
  const sessionBody = (await sessionRes.json().catch(() => ({}))) as {
    error?: string;
    sessionToken?: string;
    uploadUrl?: string;
    chunkSize?: number;
  };
  if (!sessionRes.ok || !sessionBody.sessionToken || !sessionBody.uploadUrl) {
    throw new Error(sessionBody.error || "업로드 세션을 만들지 못했습니다.");
  }

  const sessionToken = sessionBody.sessionToken;
  const uploadUrl = sessionBody.uploadUrl;
  const chunkSize =
    typeof sessionBody.chunkSize === "number" && sessionBody.chunkSize > 0
      ? sessionBody.chunkSize
      : EXPLORER_UPLOAD_CHUNK_BYTES;

  let googleFileId: string | null = null;
  let offset = 0;
  const total = file.size;

  opts?.onProgress?.({ bytesSent: 0, bytesTotal: total, percent: 0 });

  if (total === 0) {
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "X-Upload-Session": sessionToken,
        "Content-Range": "bytes */0",
        "Content-Type": file.type || "application/octet-stream",
      },
      body: new Blob([]),
      signal: opts?.signal,
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      file?: unknown;
    };
    if (!res.ok) throw new Error(body.error || "빈 파일 업로드 실패");
    googleFileId = googleFileIdFromBody(body.file);
  } else {
    while (offset < total) {
      const end = Math.min(offset + chunkSize, total);
      const blob = file.slice(offset, end);
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "X-Upload-Session": sessionToken,
          "Content-Range": `bytes ${offset}-${end - 1}/${total}`,
          "Content-Type": file.type || "application/octet-stream",
        },
        body: blob,
        signal: opts?.signal,
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        status?: number;
        file?: unknown;
      };
      if (!res.ok) {
        throw new Error(body.error || `${file.name} 청크 업로드 실패`);
      }
      offset = end;
      opts?.onProgress?.({
        bytesSent: offset,
        bytesTotal: total,
        percent: Math.round((offset / total) * 100),
      });
      if (body.status === 200 || body.status === 201) {
        googleFileId = googleFileIdFromBody(body.file);
        break;
      }
    }
  }

  if (!googleFileId) {
    throw new Error(
      `${file.name}: Google 파일 ID를 받지 못했습니다. 잠시 후 목록을 새로고침하세요.`
    );
  }

  const completeOnce = async () => {
    const res = await fetch("/api/drive/upload-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId: googleFileId, sessionToken }),
      signal: opts?.signal,
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      retryable?: boolean;
      file?: ExplorerUploadedFile;
    };
    return { res, body };
  };

  let { res, body } = await completeOnce();
  if (!res.ok && body.retryable) {
    await new Promise((r) => setTimeout(r, 600));
    ({ res, body } = await completeOnce());
  }
  if (!res.ok || !body.file) {
    throw new Error(
      body.error ||
        "Google에는 업로드됐지만 목록 등록에 실패했습니다. 새로고침 후 재시도하세요."
    );
  }

  opts?.onProgress?.({ bytesSent: total, bytesTotal: total, percent: 100 });
  return body.file;
}

/** webkitdirectory / DnD 상대경로 파일 */
export type PathFile = {
  file: File;
  /** 폴더 기준 상대 경로 (예: sub/a.txt). 루트 파일이면 파일명만 */
  relativePath: string;
};

export function filesFromFileList(list: FileList | File[]): PathFile[] {
  return Array.from(list).map((file) => {
    const rel =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath?.replace(
        /^\/+/,
        ""
      ) || file.name;
    return { file, relativePath: rel.replace(/\\/g, "/") };
  });
}

/** DataTransfer에서 폴더 트리 포함 파일 수집 */
export async function filesFromDataTransfer(
  dt: DataTransfer
): Promise<{ entries: PathFile[]; hadDirectory: boolean }> {
  const items = dt.items;
  if (!items?.length) {
    return { entries: filesFromFileList(dt.files), hadDirectory: false };
  }

  let hadDirectory = false;
  const entries: PathFile[] = [];

  const readEntry = async (
    entry: FileSystemEntry,
    pathPrefix: string
  ): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => {
        (entry as FileSystemFileEntry).file(resolve, reject);
      });
      const relativePath = pathPrefix
        ? `${pathPrefix}/${file.name}`
        : file.name;
      entries.push({ file, relativePath: relativePath.replace(/\\/g, "/") });
      return;
    }
    if (entry.isDirectory) {
      hadDirectory = true;
      const dir = entry as FileSystemDirectoryEntry;
      const reader = dir.createReader();
      const readBatch = (): Promise<FileSystemEntry[]> =>
        new Promise((resolve, reject) => {
          reader.readEntries(resolve, reject);
        });
      let batch: FileSystemEntry[] = [];
      do {
        batch = await readBatch();
        for (const child of batch) {
          const nextPrefix = pathPrefix
            ? `${pathPrefix}/${entry.name}`
            : entry.name;
          await readEntry(child, nextPrefix);
        }
      } while (batch.length > 0);
    }
  };

  const topEntries: FileSystemEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const entry = item.webkitGetAsEntry?.() ?? null;
    if (entry) topEntries.push(entry);
  }

  if (topEntries.length === 0) {
    return { entries: filesFromFileList(dt.files), hadDirectory: false };
  }

  for (const entry of topEntries) {
    await readEntry(entry, "");
  }

  return { entries, hadDirectory };
}

/** 상대경로에서 생성할 폴더 경로 목록 (깊이 오름차순, 중복 제거) */
export function folderPathsFromEntries(entries: PathFile[]): string[] {
  const set = new Set<string>();
  for (const e of entries) {
    const parts = e.relativePath.split("/").filter(Boolean);
    if (parts.length <= 1) continue;
    let acc = "";
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i]!;
      set.add(acc);
    }
  }
  return Array.from(set).sort((a, b) => {
    const da = a.split("/").length;
    const db = b.split("/").length;
    if (da !== db) return da - db;
    return a.localeCompare(b);
  });
}

export function parentFolderPath(relativePath: string): string | null {
  const parts = relativePath.split("/").filter(Boolean);
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join("/");
}
