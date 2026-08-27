/**
 * 탐색기 resumable 업로드 (클라이언트)
 * session → chunk PUT(프록시) → complete
 * 네트워크 오류 시 동일 세션으로 이어올리기 + 일시정지/재개
 */

import {
  assertExplorerUploadSize,
  EXPLORER_UPLOAD_CHUNK_BYTES,
  formatUploadBytes,
} from "@/lib/drive/explorer-upload-limits";
import { inferUploadMimeType, isUploadFileNameBlocked } from "@/lib/upload-policy";

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
  bytesRemaining: number;
  /** 0–100 */
  percent: number;
  status: "uploading" | "paused" | "retrying" | "completing";
  message?: string;
};

export type ExplorerUploadControls = {
  pause: () => void;
  resume: () => void;
  abort: () => void;
};

/** 일시정지 게이트 + 중단 */
export class ExplorerUploadSessionControl implements ExplorerUploadControls {
  private paused = false;
  private aborted = false;
  private waiters: Array<() => void> = [];
  private chunkAbort: AbortController | null = null;

  pause() {
    this.paused = true;
    this.chunkAbort?.abort();
  }

  resume() {
    if (this.aborted) return;
    this.paused = false;
    const w = this.waiters.splice(0);
    for (const fn of w) fn();
  }

  abort() {
    this.aborted = true;
    this.paused = false;
    this.chunkAbort?.abort();
    const w = this.waiters.splice(0);
    for (const fn of w) fn();
  }

  get isPaused() {
    return this.paused;
  }

  get isAborted() {
    return this.aborted;
  }

  bindChunkAbort(ac: AbortController) {
    this.chunkAbort = ac;
  }

  clearChunkAbort(ac: AbortController) {
    if (this.chunkAbort === ac) this.chunkAbort = null;
  }

  async waitIfPaused(): Promise<void> {
    while (this.paused && !this.aborted) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    if (this.aborted) throw new DOMException("업로드가 취소되었습니다.", "AbortError");
  }

  throwIfAborted() {
    if (this.aborted) throw new DOMException("업로드가 취소되었습니다.", "AbortError");
  }
}

function googleFileIdFromBody(file: unknown): string | null {
  if (!file || typeof file !== "object") return null;
  const id = (file as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/** Range: bytes=0-12345 → next offset 12346 */
export function parseUploadedOffsetFromRange(range: string | null | undefined): number | null {
  if (!range) return null;
  const m = /bytes=(\d+)-(\d+)/i.exec(range);
  if (!m) return null;
  const end = Number(m[2]);
  if (!Number.isFinite(end) || end < 0) return null;
  return end + 1;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

function isRetryableUploadError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return false;
  if (err instanceof TypeError) return true; // network
  const msg = err instanceof Error ? err.message : String(err);
  if (/네트워크|network|fetch|Failed to fetch|timeout|일시|502|503|429|ECONNRESET/i.test(msg)) {
    return true;
  }
  return false;
}

async function queryUploadedOffset(
  uploadUrl: string,
  sessionToken: string,
  total: number,
  signal?: AbortSignal
): Promise<number> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "X-Upload-Session": sessionToken,
      "Content-Range": `bytes */${total}`,
      "Content-Length": "0",
    },
    body: new Blob([]),
    signal,
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    status?: number;
    range?: string | null;
    file?: unknown;
  };
  if (!res.ok) {
    throw new Error(body.error || "업로드 진행 상태를 확인할 수 없습니다.");
  }
  if (body.status === 200 || body.status === 201) {
    return total;
  }
  const offset = parseUploadedOffsetFromRange(body.range);
  return offset ?? 0;
}

export async function uploadExplorerFileResumable(
  file: File,
  parentFolderId: string,
  opts?: {
    onProgress?: (p: UploadProgress) => void;
    signal?: AbortSignal;
    controls?: ExplorerUploadSessionControl;
  }
): Promise<ExplorerUploadedFile> {
  if (isUploadFileNameBlocked(file.name)) {
    throw new Error(
      "실행 파일은 보안상 업로드할 수 없습니다. 압축 파일(.zip)로 보내주세요."
    );
  }
  const sizeCheck = assertExplorerUploadSize(file.size);
  if (!sizeCheck.ok) throw new Error(sizeCheck.error);

  const controls = opts?.controls ?? new ExplorerUploadSessionControl();
  if (opts?.signal) {
    if (opts.signal.aborted) controls.abort();
    else opts.signal.addEventListener("abort", () => controls.abort(), { once: true });
  }

  const report = (
    sent: number,
    status: UploadProgress["status"],
    message?: string
  ) => {
    const total = file.size;
    const clamped = Math.min(Math.max(0, sent), total);
    opts?.onProgress?.({
      bytesSent: clamped,
      bytesTotal: total,
      bytesRemaining: Math.max(0, total - clamped),
      percent: total === 0 ? 100 : Math.min(100, Math.round((clamped / total) * 100)),
      status,
      message,
    });
  };

  await controls.waitIfPaused();
  controls.throwIfAborted();

  const sessionRes = await fetch("/api/drive/upload-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      parentFolderId,
      mimeType: inferUploadMimeType(file.name, file.type),
      size: file.size,
    }),
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

  report(0, "uploading");

  const putChunk = async (start: number, end: number): Promise<{
    status: number;
    file: unknown;
    range: string | null;
  }> => {
    const ac = new AbortController();
    controls.bindChunkAbort(ac);
    try {
      const blob = file.slice(start, end);
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "X-Upload-Session": sessionToken,
          "Content-Range": `bytes ${start}-${end - 1}/${total}`,
          "Content-Type": inferUploadMimeType(file.name, file.type),
        },
        body: blob,
        signal: ac.signal,
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        status?: number;
        range?: string | null;
        file?: unknown;
      };
      if (!res.ok) {
        const err = new Error(body.error || `${file.name} 청크 업로드 실패`);
        (err as Error & { retryable?: boolean }).retryable = res.status >= 500;
        throw err;
      }
      return {
        status: body.status ?? res.status,
        file: body.file ?? null,
        range: body.range ?? null,
      };
    } finally {
      controls.clearChunkAbort(ac);
    }
  };

  if (total === 0) {
    await controls.waitIfPaused();
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "X-Upload-Session": sessionToken,
        "Content-Range": "bytes */0",
        "Content-Type": inferUploadMimeType(file.name, file.type),
      },
      body: new Blob([]),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      file?: unknown;
    };
    if (!res.ok) throw new Error(body.error || "빈 파일 업로드 실패");
    googleFileId = googleFileIdFromBody(body.file);
  } else {
    let consecutiveFailures = 0;
    while (offset < total) {
      await controls.waitIfPaused();
      controls.throwIfAborted();

      if (controls.isPaused) {
        report(offset, "paused", "일시정지됨");
        continue;
      }

      const end = Math.min(offset + chunkSize, total);
      try {
        report(
          offset,
          "uploading",
          `${formatUploadBytes(offset)} / ${formatUploadBytes(total)} · 남음 ${formatUploadBytes(total - offset)}`
        );
        const result = await putChunk(offset, end);
        consecutiveFailures = 0;

        if (result.status === 200 || result.status === 201) {
          googleFileId = googleFileIdFromBody(result.file);
          offset = total;
          report(total, "completing");
          break;
        }

        const fromRange = parseUploadedOffsetFromRange(result.range);
        offset = fromRange != null ? fromRange : end;
        report(offset, "uploading");
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          // 일시정지에 의한 abort → 이어올리기
          if (controls.isAborted) throw e;
          report(offset, "paused", "일시정지됨");
          await controls.waitIfPaused();
          try {
            offset = await queryUploadedOffset(uploadUrl, sessionToken, total);
          } catch {
            /* keep local offset */
          }
          continue;
        }

        consecutiveFailures += 1;
        if (!isRetryableUploadError(e) && consecutiveFailures > 2) throw e;

        report(
          offset,
          "retrying",
          `연결 재시도 중… (${consecutiveFailures}) · ${formatUploadBytes(offset)}까지 유지`
        );
        const backoff = Math.min(15_000, 800 * 2 ** Math.min(consecutiveFailures, 4));
        await sleep(backoff);

        try {
          const resumed = await queryUploadedOffset(uploadUrl, sessionToken, total);
          offset = resumed;
          if (offset >= total) {
            // 이미 Google에 완료됐을 수 있음 — status query가 200이면 파일 id 필요
            // queryUploadedOffset returns total when 200/201 but without file id —
            // fall through to one more empty-range or complete needs fileId
            break;
          }
        } catch (qErr) {
          if (consecutiveFailures >= 8) {
            throw qErr instanceof Error ? qErr : e;
          }
        }
      }
    }

    // offset이 total인데 fileId 없으면 상태 조회로 완료 여부 확인
    if (!googleFileId && offset >= total) {
      const ac = new AbortController();
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "X-Upload-Session": sessionToken,
          "Content-Range": `bytes */${total}`,
          "Content-Length": "0",
        },
        body: new Blob([]),
        signal: ac.signal,
      });
      const body = (await res.json().catch(() => ({}))) as {
        status?: number;
        file?: unknown;
        range?: string | null;
      };
      if (body.status === 200 || body.status === 201) {
        googleFileId = googleFileIdFromBody(body.file);
      } else {
        const o = parseUploadedOffsetFromRange(body.range);
        if (o != null && o < total) {
          // 아직 남음 — 루프 재개
          offset = o;
          while (offset < total) {
            await controls.waitIfPaused();
            controls.throwIfAborted();
            const end2 = Math.min(offset + chunkSize, total);
            const result = await putChunk(offset, end2);
            if (result.status === 200 || result.status === 201) {
              googleFileId = googleFileIdFromBody(result.file);
              break;
            }
            offset = parseUploadedOffsetFromRange(result.range) ?? end2;
            report(offset, "uploading");
          }
        }
      }
    }
  }

  if (!googleFileId) {
    throw new Error(
      `${file.name}: Google 파일 ID를 받지 못했습니다. 잠시 후 목록을 새로고침하세요.`
    );
  }

  report(total, "completing", "목록에 등록 중…");

  const completeOnce = async () => {
    const res = await fetch("/api/drive/upload-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId: googleFileId, sessionToken }),
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
    await sleep(600);
    ({ res, body } = await completeOnce());
  }
  if (!res.ok || !body.file) {
    throw new Error(
      body.error ||
        "Google에는 업로드됐지만 목록 등록에 실패했습니다. 새로고침 후 재시도하세요."
    );
  }

  report(total, "uploading");
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

export { formatUploadBytes };
