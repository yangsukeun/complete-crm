"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import useSWR, { mutate, useSWRConfig } from "swr";
import {
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  HardDrive,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type DriveFileRow = {
  id: string;
  name: string;
  mimeType: string | null;
  size: string | null;
  isFolder: boolean;
  driveFileId: string | null;
  webViewLink: string | null;
  driveModifiedAt: string | null;
  parentId: string | null;
  uploading?: boolean;
  _count?: { children: number };
};

type ListPayload = {
  files: DriveFileRow[];
  parentId?: string | null;
  search?: string;
  timing?: { queryMs: number; totalMs: number };
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "요청 실패");
  return data as ListPayload;
};

function listUrlFor(parentId: string | null, search: string) {
  if (search.trim()) {
    return `/api/drive/files?search=${encodeURIComponent(search.trim())}`;
  }
  return `/api/drive/files?parentId=${encodeURIComponent(parentId ?? "")}`;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }
  const n = Math.min(concurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

function FileTypeIcon({ mimeType, isFolder }: { mimeType: string | null; isFolder: boolean }) {
  if (isFolder) return <Folder className="size-4 shrink-0 text-amber-600" />;
  const m = mimeType ?? "";
  if (m.includes("spreadsheet") || m.includes("excel")) {
    return <FileSpreadsheet className="size-4 shrink-0 text-emerald-600" />;
  }
  if (m.includes("document") || m.includes("word") || m.includes("pdf") || m.includes("text")) {
    return <FileText className="size-4 shrink-0 text-sky-600" />;
  }
  if (m.startsWith("image/")) return <FileImage className="size-4 shrink-0 text-violet-600" />;
  if (m.startsWith("video/")) return <FileVideo className="size-4 shrink-0 text-rose-600" />;
  return <File className="size-4 shrink-0 text-gray-500" />;
}

function formatSize(bytes: string | null) {
  if (!bytes) return "—";
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type Crumb = { id: string | null; name: string; driveFileId: string | null };

export function DrivePageClient({
  showExplorerSetupBanner = false,
  canDeleteFiles = false,
  explorerConfigured = false,
}: {
  showExplorerSetupBanner?: boolean;
  canDeleteFiles?: boolean;
  explorerConfigured?: boolean;
}) {
  const { mutate: globalMutate } = useSWRConfig();
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<Crumb[]>([
    { id: null, name: "전체 파일", driveFileId: null },
  ]);
  const [search, setSearch] = useState("");
  const [previewFile, setPreviewFile] = useState<DriveFileRow | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [optimisticRows, setOptimisticRows] = useState<DriveFileRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentDriveFolderId = breadcrumb[breadcrumb.length - 1]?.driveFileId ?? null;
  const canUploadHere = Boolean(explorerConfigured && currentDriveFolderId && !search.trim());

  const listUrl = useMemo(() => listUrlFor(currentId, search), [search, currentId]);

  const { data, isLoading, error, isValidating } = useSWR(listUrl, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const displayFiles = useMemo(() => {
    const base = data?.files ?? [];
    if (optimisticRows.length === 0) return base;
    const ids = new Set(base.map((f) => f.id));
    const pending = optimisticRows.filter((r) => !ids.has(r.id));
    return [...pending, ...base];
  }, [data?.files, optimisticRows]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 4000);
  };

  const prefetchFolder = useCallback(
    (folderId: string) => {
      const url = listUrlFor(folderId, "");
      void globalMutate(url, fetcher(url), { revalidate: false });
    },
    [globalMutate]
  );

  const refreshList = useCallback(async () => {
    await mutate(listUrl);
  }, [listUrl]);

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/drive/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "folder",
          googleFolderId: currentDriveFolderId,
          parentDbId: currentId,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error || "새로고침 실패");
      }
      setSyncMessage(body.message || "이 폴더 새로고침 완료");
      await refreshList();
    } catch (e) {
      setSyncMessage(e instanceof Error ? e.message : "새로고침 실패");
    } finally {
      setIsSyncing(false);
    }
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    if (!canUploadHere || !currentDriveFolderId) {
      showToast("폴더에 들어가서 업로드하세요.");
      return;
    }

    const folderId = currentDriveFolderId;
    const parentDbId = currentId;
    const temps = list.map((file, i) => ({
      id: `uploading-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      mimeType: file.type || null,
      size: String(file.size),
      isFolder: false,
      driveFileId: null,
      webViewLink: null,
      driveModifiedAt: null,
      parentId: parentDbId,
      uploading: true,
    }));

    setOptimisticRows((prev) => [...temps, ...prev]);
    setIsUploading(true);

    const indexed = list.map((file, i) => ({ file, temp: temps[i]! }));

    await mapPool(indexed, 3, async ({ file, temp }) => {
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("targetFolderId", folderId);
        const tClient = Date.now();
        const res = await fetch("/api/drive/upload", { method: "POST", body: fd });
        const body = await res.json().catch(() => ({}));
        const clientMs = Date.now() - tClient;
        if (!res.ok) {
          setOptimisticRows((prev) => prev.filter((r) => r.id !== temp.id));
          showToast(body?.error || `${file.name} 업로드 실패`);
          return;
        }
        const timing = body?.timing as
          | { receiveMs?: number; driveMs?: number; upsertMs?: number; totalMs?: number }
          | undefined;
        if (timing) {
          console.log("[drive/upload client] timing", { name: file.name, clientMs, ...timing });
        }
        const f = body.file as DriveFileRow;
        setOptimisticRows((prev) =>
          prev.map((r) =>
            r.id === temp.id
              ? {
                  ...f,
                  uploading: false,
                  driveModifiedAt: f.driveModifiedAt ?? new Date().toISOString(),
                }
              : r
          )
        );
        // swap into SWR cache then drop optimistic
        await mutate(
          listUrl,
          (cur: ListPayload | undefined) => {
            if (!cur) return cur;
            const without = cur.files.filter((x) => x.id !== f.id);
            return { ...cur, files: [f, ...without] };
          },
          { revalidate: false }
        );
        setOptimisticRows((prev) => prev.filter((r) => r.id !== temp.id));
      } catch (e) {
        setOptimisticRows((prev) => prev.filter((r) => r.id !== temp.id));
        showToast(e instanceof Error ? e.message : `${file.name} 업로드 실패`);
      }
    });

    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    void refreshList();
  };

  const handleDelete = async (file: DriveFileRow) => {
    if (!canDeleteFiles || file.isFolder || file.uploading) return;
    const ok = window.confirm("드라이브 휴지통으로 이동합니다");
    if (!ok) return;

    setDeletingId(file.id);
    try {
      const res = await fetch(`/api/drive/file/${encodeURIComponent(file.id)}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "삭제 실패");
      if (previewFile?.id === file.id) setPreviewFile(null);
      await refreshList();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setDeletingId(null);
    }
  };

  const openFolder = (folder: DriveFileRow) => {
    setCurrentId(folder.id);
    setBreadcrumb((prev) => [
      ...prev,
      { id: folder.id, name: folder.name, driveFileId: folder.driveFileId },
    ]);
    setSearch("");
  };

  const goTo = (index: number) => {
    const target = breadcrumb[index];
    if (!target) return;
    setCurrentId(target.id);
    setBreadcrumb(breadcrumb.slice(0, index + 1));
    setSearch("");
  };

  return (
    <div className="flex flex-col gap-4">
      {showExplorerSetupBanner && (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950"
          role="status"
        >
          직원용 공유 드라이브가 아직 연결되지 않았습니다. GOOGLE_DRIVE_EXPLORER_FOLDER_ID 설정
          필요
        </div>
      )}

      {toast && (
        <div
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900"
          role="status"
        >
          {toast}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <HardDrive className="size-4" />
          <span>Google Drive 연동 탐색기</span>
          {isValidating && !isLoading && (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void uploadFiles(e.target.files);
            }}
          />
          <Button
            type="button"
            variant="default"
            size="sm"
            className="gap-1.5"
            disabled={!canUploadHere || isUploading}
            title={
              !explorerConfigured
                ? "직원용 공유 드라이브가 연결되지 않았습니다"
                : !currentDriveFolderId
                  ? "폴더에 들어가서 업로드하세요"
                  : search.trim()
                    ? "검색 중에는 업로드할 수 없습니다"
                    : "현재 폴더에 파일 업로드"
            }
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {isUploading ? "업로드 중…" : "+ 파일 업로드"}
          </Button>
          <Input
            type="search"
            placeholder="파일 검색…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-[220px] rounded-full"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
            className="gap-1.5"
            title="현재 폴더만 Drive에서 새로고침 (전체 동기화는 매일 자동)"
          >
            {isSyncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {isSyncing ? "새로고침 중…" : "이 폴더 새로고침"}
          </Button>
        </div>
      </div>

      {syncMessage && (
        <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          {syncMessage}
        </p>
      )}

      {!search.trim() && (
        <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="경로">
          {breadcrumb.map((item, i) => (
            <span key={`${item.id ?? "root"}-${i}`} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground">/</span>}
              <button
                type="button"
                onClick={() => goTo(i)}
                className={cn(
                  "rounded px-1.5 py-0.5",
                  i < breadcrumb.length - 1
                    ? "text-sky-700 hover:bg-sky-50"
                    : "font-medium text-gray-900"
                )}
                disabled={i === breadcrumb.length - 1}
              >
                {item.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      <div
        className={cn(
          "overflow-hidden rounded-lg border bg-white transition-colors",
          dragOver && canUploadHere ? "border-sky-400 ring-2 ring-sky-200" : "border-gray-200"
        )}
        onDragEnter={(e) => {
          e.preventDefault();
          if (canUploadHere) setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (canUploadHere) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (e.currentTarget === e.target) setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!canUploadHere) {
            showToast("폴더에 들어가서 업로드하세요.");
            return;
          }
          if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
        }}
      >
        {dragOver && canUploadHere && (
          <div className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-center text-sm text-sky-800">
            여기에 파일을 놓으면 현재 폴더에 업로드됩니다
          </div>
        )}

        <div className="grid grid-cols-[minmax(0,2fr)_120px_100px_200px] gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-medium text-muted-foreground">
          <span>이름</span>
          <span>수정일</span>
          <span>크기</span>
          <span>작업</span>
        </div>

        {isLoading && !data && (
          <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            불러오는 중…
          </div>
        )}

        {error && !isLoading && !data && (
          <div className="px-4 py-16 text-center text-sm text-rose-600">
            {error instanceof Error ? error.message : "목록을 불러오지 못했습니다."}
          </div>
        )}

        {displayFiles.map((file) => (
          <div
            key={file.id}
            role="row"
            tabIndex={0}
            onMouseEnter={() => {
              if (file.isFolder && !file.uploading) prefetchFolder(file.id);
            }}
            onDoubleClick={() => {
              if (file.uploading) return;
              if (file.isFolder) openFolder(file);
              else setPreviewFile(file);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !file.uploading) {
                if (file.isFolder) openFolder(file);
                else setPreviewFile(file);
              }
            }}
            className={cn(
              "grid grid-cols-[minmax(0,2fr)_120px_100px_200px] items-center gap-2 border-b border-gray-100 px-4 py-2.5 text-sm",
              file.uploading ? "bg-gray-50 text-muted-foreground" : "hover:bg-gray-50"
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              {file.uploading ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-gray-400" />
              ) : (
                <FileTypeIcon mimeType={file.mimeType} isFolder={file.isFolder} />
              )}
              <span
                className={cn(
                  "truncate font-medium",
                  file.uploading ? "text-gray-500" : "text-gray-900"
                )}
              >
                {file.uploading ? `${file.name} (업로드 중…)` : file.name}
              </span>
              {file.isFolder && (file._count?.children ?? 0) > 0 && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  ({file._count?.children})
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {file.uploading
                ? "—"
                : file.driveModifiedAt
                  ? new Date(file.driveModifiedAt).toLocaleDateString("ko")
                  : "—"}
            </span>
            <span className="text-xs text-muted-foreground">
              {file.isFolder ? "—" : formatSize(file.size)}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {file.uploading ? (
                <span className="text-xs text-muted-foreground">업로드 중</span>
              ) : file.isFolder ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onMouseEnter={() => prefetchFolder(file.id)}
                  onClick={() => openFolder(file)}
                >
                  열기
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setPreviewFile(file)}
                  >
                    미리보기
                  </Button>
                  {file.webViewLink && (
                    <a
                      href={file.webViewLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-7 items-center rounded-md border border-sky-600 px-2 text-xs text-sky-700 hover:bg-sky-50"
                      onClick={(e) => e.stopPropagation()}
                    >
                      구글에서 열기
                    </a>
                  )}
                  {canDeleteFiles && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs text-rose-700 hover:bg-rose-50"
                      disabled={deletingId === file.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(file);
                      }}
                    >
                      {deletingId === file.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                      삭제
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}

        {!isLoading && !error && displayFiles.length === 0 && (
          <div className="px-4 py-16 text-center text-sm text-muted-foreground">
            {search.trim()
              ? `"${search.trim()}" 검색 결과가 없습니다`
              : canUploadHere
                ? "이 폴더는 비어 있습니다. 파일을 끌어다 놓거나 업로드 버튼을 사용하세요."
                : "이 폴더는 비어 있습니다. 「이 폴더 새로고침」으로 Drive에서 가져와 주세요."}
          </div>
        )}
      </div>

      {previewFile && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPreviewFile(null)}
          role="presentation"
        >
          <div
            className="flex h-[85vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={previewFile.name}
          >
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
              <span className="truncate text-sm font-medium">{previewFile.name}</span>
              <div className="flex shrink-0 items-center gap-2">
                {previewFile.webViewLink && (
                  <a
                    href={previewFile.webViewLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center rounded-md bg-sky-600 px-3 text-xs font-medium text-white hover:bg-sky-700"
                  >
                    구글에서 열기
                  </a>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => setPreviewFile(null)}
                >
                  <X className="size-3.5" />
                  닫기
                </Button>
              </div>
            </div>
            <iframe
              title={previewFile.name}
              src={
                previewFile.driveFileId
                  ? `https://drive.google.com/file/d/${previewFile.driveFileId}/preview`
                  : previewFile.webViewLink || "about:blank"
              }
              className="h-full w-full flex-1 border-0"
              allow="autoplay"
            />
          </div>
        </div>
      )}
    </div>
  );
}
