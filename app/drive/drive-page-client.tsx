"use client";

import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import {
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  HardDrive,
  Loader2,
  RefreshCw,
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
  _count?: { children: number };
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "요청 실패");
  return data as { files: DriveFileRow[]; parentId?: string | null; search?: string };
};

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

type Crumb = { id: string | null; name: string };

export function DrivePageClient() {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<Crumb[]>([{ id: null, name: "전체 파일" }]);
  const [search, setSearch] = useState("");
  const [previewFile, setPreviewFile] = useState<DriveFileRow | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const listUrl = useMemo(() => {
    if (search.trim()) {
      return `/api/drive/files?search=${encodeURIComponent(search.trim())}`;
    }
    return `/api/drive/files?parentId=${encodeURIComponent(currentId ?? "")}`;
  }, [search, currentId]);

  const { data, isLoading, error } = useSWR(listUrl, fetcher);

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/drive/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "동기화 실패");
      setSyncMessage(body.message || `동기화 완료: ${body.totalInDb ?? 0}개`);
      await mutate(listUrl);
      await mutate(`/api/drive/files?parentId=`);
    } catch (e) {
      setSyncMessage(e instanceof Error ? e.message : "동기화 실패");
    } finally {
      setIsSyncing(false);
    }
  };

  const openFolder = (folder: DriveFileRow) => {
    setCurrentId(folder.id);
    setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.name }]);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <HardDrive className="size-4" />
          <span>Google Drive 연동 탐색기</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          >
            {isSyncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {isSyncing ? "동기화 중…" : "동기화"}
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

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="grid grid-cols-[minmax(0,2fr)_120px_100px_180px] gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-medium text-muted-foreground">
          <span>이름</span>
          <span>수정일</span>
          <span>크기</span>
          <span>작업</span>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            불러오는 중…
          </div>
        )}

        {error && !isLoading && (
          <div className="px-4 py-16 text-center text-sm text-rose-600">
            {error instanceof Error ? error.message : "목록을 불러오지 못했습니다."}
          </div>
        )}

        {!isLoading &&
          !error &&
          data?.files?.map((file) => (
            <div
              key={file.id}
              role="row"
              tabIndex={0}
              onDoubleClick={() => {
                if (file.isFolder) openFolder(file);
                else setPreviewFile(file);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (file.isFolder) openFolder(file);
                  else setPreviewFile(file);
                }
              }}
              className="grid grid-cols-[minmax(0,2fr)_120px_100px_180px] items-center gap-2 border-b border-gray-100 px-4 py-2.5 text-sm hover:bg-gray-50"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileTypeIcon mimeType={file.mimeType} isFolder={file.isFolder} />
                <span className="truncate font-medium text-gray-900">{file.name}</span>
                {file.isFolder && (file._count?.children ?? 0) > 0 && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    ({file._count?.children})
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {file.driveModifiedAt
                  ? new Date(file.driveModifiedAt).toLocaleDateString("ko")
                  : "—"}
              </span>
              <span className="text-xs text-muted-foreground">
                {file.isFolder ? "—" : formatSize(file.size)}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {file.isFolder ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
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
                  </>
                )}
              </div>
            </div>
          ))}

        {!isLoading && !error && (data?.files?.length ?? 0) === 0 && (
          <div className="px-4 py-16 text-center text-sm text-muted-foreground">
            {search.trim()
              ? `"${search.trim()}" 검색 결과가 없습니다`
              : "이 폴더는 비어 있습니다. 상단 동기화 버튼을 눌러 Drive에서 가져와 주세요."}
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
