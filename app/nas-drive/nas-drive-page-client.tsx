"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUp,
  ExternalLink,
  File,
  Folder,
  Loader2,
  RefreshCw,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NasFile = {
  name: string;
  path: string;
  isDir: boolean;
  size: number | null;
  mtime: number | null;
  ext: string | null;
  openUrl: string;
};

type ListPayload = {
  path: string;
  parentPath: string | null;
  rootPath: string;
  files: NasFile[];
  openUrl: string;
  error?: string;
  code?: string;
};

function formatSize(bytes: number | null) {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMtime(sec: number | null) {
  if (sec == null) return "—";
  return new Date(sec * 1000).toLocaleDateString("ko");
}

function errorHint(code?: string): string | null {
  if (code === "AUTH_FAILED") return "서비스계정 인증 실패로 보입니다. 계정·비밀번호를 확인하세요.";
  if (code === "NETWORK") return "사내망·방화벽 또는 NAS 전원/연결 문제일 수 있습니다.";
  if (code === "QUICKCONNECT")
    return "QuickConnect 릴레이 이슈일 수 있습니다. NAS_API_BASE_URL(직접 주소)이 필요할 수 있습니다.";
  if (code === "NOT_CONFIGURED") return "관리자가 NAS 환경변수를 설정해야 합니다.";
  return null;
}

export function NasDrivePageClient() {
  const [path, setPath] = useState<string | null>(null);
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>();

  const load = useCallback(async (targetPath: string | null) => {
    setLoading(true);
    setError(null);
    setErrorCode(undefined);
    try {
      const q =
        targetPath != null && targetPath !== ""
          ? `?path=${encodeURIComponent(targetPath)}`
          : "";
      const res = await fetch(`/api/nas/files${q}`);
      const body = (await res.json().catch(() => ({}))) as ListPayload;
      if (!res.ok) {
        setErrorCode(body.code);
        throw new Error(body.error || "목록을 불러오지 못했습니다.");
      }
      setData(body);
      setPath(body.path);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(null);
  }, [load]);

  const crumbs = useMemo(() => {
    if (!data) return [] as { label: string; path: string }[];
    const root = data.rootPath;
    const parts = data.path.replace(root, "").split("/").filter(Boolean);
    const out: { label: string; path: string }[] = [{ label: "문서함", path: root }];
    let acc = root;
    for (const p of parts) {
      acc = `${acc}/${p}`.replace(/\/+/g, "/");
      out.push({ label: p, path: acc });
    }
    return out;
  }, [data]);

  const openExternal = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const onRowActivate = (file: NasFile) => {
    if (file.isDir) {
      void load(file.path);
      return;
    }
    openExternal(file.openUrl);
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-950"
        role="status"
      >
        이 파일은 NAS 로그인 후 열람됩니다. CRM은 목록만 보여 주며, 파일을 클릭하면 시놀로지
        웹(File Station)이 새 탭에서 열립니다.
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Server className="size-4" />
          <span>NAS 문서함</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={loading || !data?.parentPath}
            title="상위 폴더"
            onClick={() => data?.parentPath && void load(data.parentPath)}
          >
            <ArrowUp className="size-4" />
            상위
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={loading}
            onClick={() => void load(path)}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            새로고침
          </Button>
        </div>
      </div>

      {data && !error && (
        <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="경로">
          {crumbs.map((c, i) => (
            <span key={c.path} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground">/</span>}
              <button
                type="button"
                disabled={i === crumbs.length - 1}
                onClick={() => void load(c.path)}
                className={cn(
                  "rounded px-1.5 py-0.5",
                  i < crumbs.length - 1
                    ? "text-sky-700 hover:bg-sky-50"
                    : "font-medium text-gray-900"
                )}
              >
                {c.label}
              </button>
            </span>
          ))}
        </nav>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="grid grid-cols-[minmax(0,2fr)_120px_100px_120px] gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-medium text-muted-foreground">
          <span>이름</span>
          <span>수정일</span>
          <span>크기</span>
          <span>작업</span>
        </div>

        {loading && !data && (
          <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            NAS에서 목록을 불러오는 중…
          </div>
        )}

        {error && (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-rose-700">{error}</p>
            {errorHint(errorCode) && (
              <p className="mt-2 text-xs text-muted-foreground">{errorHint(errorCode)}</p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => void load(path)}
            >
              다시 시도
            </Button>
          </div>
        )}

        {!error &&
          data?.files.map((file) => (
            <div
              key={file.path}
              role="row"
              tabIndex={0}
              onDoubleClick={() => onRowActivate(file)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRowActivate(file);
              }}
              className="grid grid-cols-[minmax(0,2fr)_120px_100px_120px] items-center gap-2 border-b border-gray-100 px-4 py-2.5 text-sm hover:bg-gray-50"
            >
              <div className="flex min-w-0 items-center gap-2">
                {file.isDir ? (
                  <Folder className="size-4 shrink-0 text-amber-600" />
                ) : (
                  <File className="size-4 shrink-0 text-gray-500" />
                )}
                <span className="truncate font-medium text-gray-900">{file.name}</span>
              </div>
              <span className="text-xs text-muted-foreground">{formatMtime(file.mtime)}</span>
              <span className="text-xs text-muted-foreground">
                {file.isDir ? "—" : formatSize(file.size)}
              </span>
              <div>
                {file.isDir ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => void load(file.path)}
                  >
                    열기
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => openExternal(file.openUrl)}
                    title="NAS에서 열람"
                  >
                    <ExternalLink className="size-3.5" />
                    NAS에서
                  </Button>
                )}
              </div>
            </div>
          ))}

        {!loading && !error && data && data.files.length === 0 && (
          <div className="px-4 py-16 text-center text-sm text-muted-foreground">
            이 폴더는 비어 있습니다.
          </div>
        )}
      </div>
    </div>
  );
}
