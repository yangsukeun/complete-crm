"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR, { mutate, useSWRConfig } from "swr";
import {
  Pin,
  PinOff,
  Pause,
  Play,
  Pencil,
  LayoutGrid,
  Rows3,
  MoreHorizontal,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderPlus,
  HardDrive,
  Loader2,
  Plus,
  Presentation,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FolderPickerModal, type FolderPickerSelection } from "@/components/drive/folder-picker-modal";
import { postExplorerFolder } from "@/lib/drive/explorer-folder-api";
import {
  canManageExplorerFolderTrash,
  canRenameExplorerItem,
  canTrashExplorerFile,
} from "@/lib/drive/folder-trash-policy";
import {
  ExplorerUploadSessionControl,
  filesFromDataTransfer,
  filesFromFileList,
  folderPathsFromEntries,
  formatUploadBytes,
  parentFolderPath,
  uploadExplorerFileResumable,
  type PathFile,
} from "@/lib/drive/explorer-resumable-upload";
import {
  assertExplorerUploadSize,
  EXPLORER_UPLOAD_LARGE_CONFIRM_MESSAGE,
  needsLargeUploadConfirm,
} from "@/lib/drive/explorer-upload-limits";
import { cn } from "@/lib/utils";
import Link from "next/link";

type DriveFileRow = {
  id: string;
  name: string;
  mimeType: string | null;
  size: string | null;
  isFolder: boolean;
  driveFileId: string | null;
  webViewLink: string | null;
  thumbnailLink?: string | null;
  driveModifiedAt: string | null;
  parentId: string | null;
  createdBy?: string | null;
  /** 개인 상단고정 */
  pinned?: boolean;
  uploading?: boolean;
  /** 0–100 업로드 진행률 */
  uploadPercent?: number | null;
  uploadBytesSent?: number | null;
  uploadBytesTotal?: number | null;
  uploadPaused?: boolean;
  uploadStatusText?: string | null;
  /** 낙관적 새 폴더 생성 중 */
  creating?: boolean;
  _count?: { children: number };
};

type DriveViewMode = "list" | "grid";
const DRIVE_VIEW_MODE_KEY = "drive-explorer-view-mode";

type FolderUploadFailure = {
  relativePath: string;
  file: File;
  parentDriveId: string;
  error: string;
};

type ListPayload = {
  files: DriveFileRow[];
  parentId?: string | null;
  search?: string;
  timing?: { queryMs: number; totalMs: number };
};

const CLIENT_SYNC_THROTTLE_MS = 20_000;
const DELETE_SUPPRESS_MS = 15_000;
const SYNC_TS_STORAGE_KEY = "drive-explorer-sync-ts";
const DELETE_SUPPRESS_STORAGE_KEY = "drive-explorer-delete-suppress";

function syncThrottleKey(parentDbId: string | null, googleFolderId: string | null) {
  return `${parentDbId ?? "root"}::${googleFolderId ?? "root"}`;
}

function readJsonMap(storageKey: string): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeJsonMap(storageKey: string, map: Record<string, number>) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    /* private mode 등 */
  }
}

function shouldSkipClientSync(key: string): boolean {
  const map = readJsonMap(SYNC_TS_STORAGE_KEY);
  const ts = map[key] ?? 0;
  return ts > 0 && Date.now() - ts < CLIENT_SYNC_THROTTLE_MS;
}

function markClientSync(key: string) {
  const map = readJsonMap(SYNC_TS_STORAGE_KEY);
  map[key] = Date.now();
  writeJsonMap(SYNC_TS_STORAGE_KEY, map);
}

/** 삭제 직후 자동 동기화 억제 — 유령 파일 부활 방지 (첫 진입 강제보다 우선) */
function isDeleteSyncSuppressed(key: string): boolean {
  const map = readJsonMap(DELETE_SUPPRESS_STORAGE_KEY);
  const until = map[key] ?? 0;
  return until > Date.now();
}

function markDeleteSyncSuppress(key: string) {
  const map = readJsonMap(DELETE_SUPPRESS_STORAGE_KEY);
  map[key] = Date.now() + DELETE_SUPPRESS_MS;
  writeJsonMap(DELETE_SUPPRESS_STORAGE_KEY, map);
}

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

function FileTypeIconLarge({
  mimeType,
  isFolder,
}: {
  mimeType: string | null;
  isFolder: boolean;
}) {
  if (isFolder) return <Folder className="size-14 text-amber-500" />;
  const m = mimeType ?? "";
  if (m.includes("spreadsheet") || m.includes("excel")) {
    return <FileSpreadsheet className="size-14 text-emerald-500" />;
  }
  if (m.includes("document") || m.includes("word") || m.includes("pdf") || m.includes("text")) {
    return <FileText className="size-14 text-sky-500" />;
  }
  if (m.startsWith("image/")) return <FileImage className="size-14 text-violet-500" />;
  if (m.startsWith("video/")) return <FileVideo className="size-14 text-rose-500" />;
  return <File className="size-14 text-gray-400" />;
}

function mayHaveDriveThumbnail(
  mimeType: string | null,
  isFolder: boolean,
  thumbnailLink?: string | null
): boolean {
  if (isFolder) return false;
  if (thumbnailLink) return true;
  const m = mimeType ?? "";
  return (
    m.startsWith("image/") ||
    m.startsWith("video/") ||
    m === "application/pdf" ||
    m.includes("google-apps.document") ||
    m.includes("google-apps.spreadsheet") ||
    m.includes("google-apps.presentation") ||
    m.includes("google-apps.drawing")
  );
}

/** lazy 썸네일 — 실패 시 아이콘 폴백 */
function DriveThumb({
  fileId,
  mimeType,
  isFolder,
  hasThumbHint,
  className,
}: {
  fileId: string;
  mimeType: string | null;
  isFolder: boolean;
  hasThumbHint: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (isFolder || !hasThumbHint || failed) {
    return (
      <div className={cn("flex items-center justify-center bg-gray-50", className)}>
        <FileTypeIconLarge mimeType={mimeType} isFolder={isFolder} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/drive/thumbnail/${encodeURIComponent(fileId)}?w=256`}
      alt=""
      loading="lazy"
      decoding="async"
      className={cn("h-full w-full object-cover", className)}
      onError={() => setFailed(true)}
    />
  );
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

const ROOT_CRUMB: Crumb = { id: null, name: "전체 파일", driveFileId: null };

const FOLDER_UNAVAILABLE_TOAST = "폴더를 열 수 없습니다. 루트로 이동합니다.";

type BreadcrumbPayload = {
  path?: { id: string; name: string; driveFileId: string | null; parentId: string | null }[];
  error?: string;
};

export function DrivePageClient({
  showExplorerSetupBanner = false,
  canDeleteFiles = false,
  explorerConfigured = false,
  viewerUserId = "",
  viewerRole = "",
  isDriveAdmin = false,
}: {
  showExplorerSetupBanner?: boolean;
  /** @deprecated 파일 삭제는 createdBy·역할로 항목별 판단 */
  canDeleteFiles?: boolean;
  explorerConfigured?: boolean;
  viewerUserId?: string;
  viewerRole?: string;
  isDriveAdmin?: boolean;
}) {
  void canDeleteFiles;
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderParam = searchParams.get("folder")?.trim() || null;

  const { mutate: globalMutate } = useSWRConfig();
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<Crumb[]>([ROOT_CRUMB]);
  /** URL folder 해석 전에는 자동 동기화·목록을 루트로 한 번 돌리지 않음 */
  const [navReady, setNavReady] = useState(() => !folderParam);
  const [search, setSearch] = useState("");
  const [previewFile, setPreviewFile] = useState<DriveFileRow | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadBanner, setUploadBanner] = useState<string | null>(null);
  const [folderUploadFailures, setFolderUploadFailures] = useState<FolderUploadFailure[]>(
    []
  );
  const [largeConfirmOpen, setLargeConfirmOpen] = useState(false);
  const [largeConfirmMessage, setLargeConfirmMessage] = useState(
    EXPLORER_UPLOAD_LARGE_CONFIRM_MESSAGE
  );
  const largeConfirmResolver = useRef<((ok: boolean) => void) | null>(null);
  const uploadControlsRef = useRef<Map<string, ExplorerUploadSessionControl>>(new Map());
  const [toast, setToast] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<DriveViewMode>("list");
  const [dragOver, setDragOver] = useState(false);
  const [optimisticRows, setOptimisticRows] = useState<DriveFileRow[]>([]);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingCreateType, setPendingCreateType] = useState<
    "document" | "spreadsheet" | "presentation" | null
  >(null);
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const autoSyncInFlight = useRef<string | null>(null);
  /** /drive 페이지 세션에서 첫 자동 동기화(마운트)만 스로틀 무시 */
  const mountSyncPendingRef = useRef(true);
  const resolvingFolderRef = useRef<string | null>(null);
  /** URL과 동기화된 현재 Google folder id (낙관적 이동·중복 fetch 방지) */
  const appliedFolderRef = useRef<string | null>(null);

  const currentDriveFolderId = breadcrumb[breadcrumb.length - 1]?.driveFileId ?? null;
  const canUploadHere = Boolean(explorerConfigured && currentDriveFolderId && !search.trim());
  const canCreateFolderHere = canUploadHere;
  const canGoUp = breadcrumb.length > 1;

  const listUrl = useMemo(() => listUrlFor(currentId, search), [search, currentId]);

  const { data, isLoading, error, isValidating } = useSWR(navReady ? listUrl : null, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const displayFiles = useMemo(() => {
    const base = data?.files ?? [];
    const ids = new Set(base.map((f) => f.id));
    const pending = optimisticRows.filter((r) => !ids.has(r.id));
    const merged = [...pending, ...base];
    return [...merged].sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name, "ko");
    });
  }, [data?.files, optimisticRows]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 4000);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRIVE_VIEW_MODE_KEY);
      if (raw === "list" || raw === "grid") setViewMode(raw);
    } catch {
      /* ignore */
    }
  }, []);

  const changeViewMode = (mode: DriveViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(DRIVE_VIEW_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  };

  const driveUrlFor = useCallback((driveFileId: string | null) => {
    if (!driveFileId) return "/drive";
    return `/drive?folder=${encodeURIComponent(driveFileId)}`;
  }, []);

  /** 폴더 이동 → URL 히스토리 (브라우저 뒤로가기 = 이전 폴더) */
  const navigateToDriveFolder = useCallback(
    (driveFileId: string | null) => {
      const next = driveUrlFor(driveFileId);
      const cur =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : "";
      if (cur === next) return;
      router.push(next);
    },
    [driveUrlFor, router]
  );

  const applyFolderPath = useCallback(
    (path: { id: string; name: string; driveFileId: string | null }[]) => {
      const crumbs: Crumb[] = [
        ROOT_CRUMB,
        ...path.map((p) => ({
          id: p.id,
          name: p.name,
          driveFileId: p.driveFileId,
        })),
      ];
      const leaf = crumbs[crumbs.length - 1]!;
      setBreadcrumb(crumbs);
      setCurrentId(leaf.id);
      setOptimisticRows([]);
      setSearch("");
      appliedFolderRef.current = leaf.driveFileId;
    },
    []
  );

  // URL ?folder= ↔ 탐색기 상태 (새로고침·공유·뒤로/앞으로)
  useEffect(() => {
    let cancelled = false;

    async function syncFromUrl() {
      if (!folderParam) {
        resolvingFolderRef.current = null;
        if (appliedFolderRef.current !== null) {
          setBreadcrumb([ROOT_CRUMB]);
          setCurrentId(null);
          setOptimisticRows([]);
          appliedFolderRef.current = null;
        }
        setNavReady(true);
        return;
      }

      // 낙관적 이동·이미 적용된 폴더면 API 생략
      if (appliedFolderRef.current === folderParam) {
        setNavReady(true);
        return;
      }

      if (resolvingFolderRef.current === folderParam) return;
      resolvingFolderRef.current = folderParam;
      setNavReady(false);

      try {
        const res = await fetch(
          `/api/drive/breadcrumb?folder=${encodeURIComponent(folderParam)}`
        );
        const body = (await res.json().catch(() => ({}))) as BreadcrumbPayload;
        if (cancelled) return;

        if (!res.ok || !Array.isArray(body.path)) {
          resolvingFolderRef.current = null;
          showToast(FOLDER_UNAVAILABLE_TOAST);
          appliedFolderRef.current = null;
          setBreadcrumb([ROOT_CRUMB]);
          setCurrentId(null);
          setNavReady(true);
          router.replace("/drive");
          return;
        }

        if (body.path.length === 0) {
          setBreadcrumb([ROOT_CRUMB]);
          setCurrentId(null);
          setOptimisticRows([]);
          appliedFolderRef.current = null;
          setNavReady(true);
          resolvingFolderRef.current = null;
          router.replace("/drive");
          return;
        }

        applyFolderPath(body.path);
        setNavReady(true);
        resolvingFolderRef.current = null;
      } catch {
        if (cancelled) return;
        resolvingFolderRef.current = null;
        showToast(FOLDER_UNAVAILABLE_TOAST);
        appliedFolderRef.current = null;
        setBreadcrumb([ROOT_CRUMB]);
        setCurrentId(null);
        setNavReady(true);
        router.replace("/drive");
      }
    }

    void syncFromUrl();
    return () => {
      cancelled = true;
    };
  }, [folderParam, applyFolderPath, router, showToast]);

  const prefetchFolder = useCallback(
    (folderId: string) => {
      const url = listUrlFor(folderId, "");
      void globalMutate(url, fetcher(url), { revalidate: false });
    },
    [globalMutate]
  );

  const refreshList = useCallback(async () => {
    await mutate(listUrl, undefined, { revalidate: true });
  }, [listUrl]);

  const runFolderSync = useCallback(
    async (opts: {
      parentDbId: string | null;
      googleFolderId: string | null;
      force?: boolean;
      source: "manual" | "auto";
      /** mount = 첫 진입(클라이언트 20초 스로틀 무시). navigate | visibility = 20초 적용 */
      trigger?: "mount" | "navigate" | "visibility";
    }) => {
      const key = syncThrottleKey(opts.parentDbId, opts.googleFolderId);

      // 삭제 억제가 최우선 (첫 진입 강제·자동 동기화 모두 차단 — 유령 부활 방지)
      if (opts.source === "auto" && isDeleteSyncSuppressed(key)) {
        console.log("[drive auto-sync] skip — delete suppress 15s", key);
        return { skipped: true as const, reason: "delete-suppress" as const };
      }

      const bypassClientThrottle = opts.force === true || opts.trigger === "mount";
      if (!bypassClientThrottle && shouldSkipClientSync(key)) {
        console.log("[drive auto-sync] client skip 20s", key);
        return { skipped: true as const, reason: "client-throttle" as const };
      }
      if (!opts.force && autoSyncInFlight.current === key) {
        return { skipped: true as const, reason: "in-flight" as const };
      }

      if (opts.source === "manual") setIsSyncing(true);
      else {
        autoSyncInFlight.current = key;
        setIsAutoSyncing(true);
      }

      try {
        const res = await fetch("/api/drive/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "folder",
            googleFolderId: opts.googleFolderId,
            parentDbId: opts.parentDbId,
            force: opts.force === true,
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          throw new Error(body?.error || "새로고침 실패");
        }
        markClientSync(key);
        if (opts.source === "manual") {
          setSyncMessage(body.message || "이 폴더 새로고침 완료");
        } else if (body.skippedDrive) {
          console.log("[drive auto-sync] server skipped Drive", key);
        } else {
          console.log("[drive auto-sync] ok", key, {
            upserted: body.upserted,
            totalInDb: body.totalInDb,
            trigger: opts.trigger,
          });
        }
        // 동기화 후 목록 확실히 재검증 (캐시→최신 교체)
        const folderListUrl = listUrlFor(opts.parentDbId, "");
        await mutate(folderListUrl, undefined, { revalidate: true });
        return { skipped: false as const, body };
      } finally {
        if (opts.source === "manual") setIsSyncing(false);
        else {
          if (autoSyncInFlight.current === key) autoSyncInFlight.current = null;
          setIsAutoSyncing(false);
        }
      }
    },
    []
  );

  const handleSync = async () => {
    setSyncMessage(null);
    try {
      await runFolderSync({
        parentDbId: currentId,
        googleFolderId: currentDriveFolderId,
        force: true,
        source: "manual",
      });
    } catch (e) {
      setSyncMessage(e instanceof Error ? e.message : "새로고침 실패");
    }
  };

  // 마운트·폴더 이동 시 자동 직계 동기화 (검색 중 제외, URL 해석 후)
  useEffect(() => {
    if (!navReady) return;
    if (search.trim()) return;
    const isMount = mountSyncPendingRef.current;
    if (isMount) mountSyncPendingRef.current = false;
    void runFolderSync({
      parentDbId: currentId,
      googleFolderId: currentDriveFolderId,
      force: false,
      source: "auto",
      trigger: isMount ? "mount" : "navigate",
    }).catch((e) => {
      console.warn("[drive auto-sync]", e);
    });
  }, [navReady, currentId, currentDriveFolderId, search, runFolderSync]);

  // 탭 복귀 시 현재 폴더 1회 (20초 스로틀)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (!navReady) return;
      if (search.trim()) return;
      void runFolderSync({
        parentDbId: currentId,
        googleFolderId: currentDriveFolderId,
        force: false,
        source: "auto",
        trigger: "visibility",
      }).catch((e) => {
        console.warn("[drive auto-sync visibility]", e);
      });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [navReady, currentId, currentDriveFolderId, search, runFolderSync]);

  const askLargeUploadConfirm = useCallback((files: File[]) => {
    const large = files.filter((f) => needsLargeUploadConfirm(f.size));
    if (large.length === 0) return Promise.resolve(true);
    const names = large
      .slice(0, 3)
      .map((f) => `${f.name} (${formatUploadBytes(f.size)})`)
      .join(", ");
    const extra =
      large.length > 3 ? ` 외 ${large.length - 3}개` : large.length > 1 ? ` 등 ${large.length}개` : "";
    setLargeConfirmMessage(
      `${EXPLORER_UPLOAD_LARGE_CONFIRM_MESSAGE}\n\n${names}${extra}`
    );
    setLargeConfirmOpen(true);
    return new Promise<boolean>((resolve) => {
      largeConfirmResolver.current = resolve;
    });
  }, []);

  const resolveLargeConfirm = (ok: boolean) => {
    setLargeConfirmOpen(false);
    largeConfirmResolver.current?.(ok);
    largeConfirmResolver.current = null;
  };

  const toggleUploadPause = (tempId: string) => {
    const ctrl = uploadControlsRef.current.get(tempId);
    if (!ctrl) return;
    if (ctrl.isPaused) {
      ctrl.resume();
      setOptimisticRows((prev) =>
        prev.map((r) =>
          r.id === tempId
            ? { ...r, uploadPaused: false, uploadStatusText: "재개 중…" }
            : r
        )
      );
    } else {
      ctrl.pause();
      setOptimisticRows((prev) =>
        prev.map((r) =>
          r.id === tempId
            ? { ...r, uploadPaused: true, uploadStatusText: "일시정지됨" }
            : r
        )
      );
    }
  };

  const commitUploadedFile = async (tempId: string, f: DriveFileRow) => {
    uploadControlsRef.current.delete(tempId);
    setOptimisticRows((prev) => prev.filter((r) => r.id !== tempId));
    const inCurrentFolder =
      (f.parentId ?? null) === (currentId ?? null) || f.parentId === currentId;
    if (!inCurrentFolder) return;
    await mutate(
      listUrl,
      (cur: ListPayload | undefined) => {
        if (!cur) return cur;
        const without = cur.files.filter((x) => x.id !== f.id);
        return { ...cur, files: [f, ...without] };
      },
      { revalidate: false }
    );
  };

  const uploadSingleResumable = async (
    file: File,
    parentDriveId: string,
    parentDbId: string | null,
    tempId: string
  ) => {
    const sizeCheck = assertExplorerUploadSize(file.size);
    if (!sizeCheck.ok) {
      setOptimisticRows((prev) => prev.filter((r) => r.id !== tempId));
      showToast(sizeCheck.error);
      return { ok: false as const, error: sizeCheck.error };
    }
    const controls = new ExplorerUploadSessionControl();
    uploadControlsRef.current.set(tempId, controls);
    try {
      const uploaded = await uploadExplorerFileResumable(file, parentDriveId, {
        controls,
        onProgress: (p) => {
          setOptimisticRows((prev) =>
            prev.map((r) =>
              r.id === tempId
                ? {
                    ...r,
                    uploadPercent: p.percent,
                    uploadBytesSent: p.bytesSent,
                    uploadBytesTotal: p.bytesTotal,
                    uploadPaused: p.status === "paused",
                    uploadStatusText:
                      p.status === "paused"
                        ? "일시정지됨"
                        : p.status === "retrying"
                          ? p.message ?? "재시도 중…"
                          : p.message ??
                            `${p.percent}% · 남음 ${formatUploadBytes(p.bytesRemaining)}`,
                  }
                : r
            )
          );
        },
      });
      await commitUploadedFile(tempId, uploaded as DriveFileRow);
      return { ok: true as const };
    } catch (e) {
      uploadControlsRef.current.delete(tempId);
      setOptimisticRows((prev) => prev.filter((r) => r.id !== tempId));
      if (e instanceof DOMException && e.name === "AbortError") {
        return { ok: false as const, error: "취소됨" };
      }
      const msg = e instanceof Error ? e.message : `${file.name} 업로드 실패`;
      showToast(msg);
      return { ok: false as const, error: msg };
    }
  };

  /** 평탄 파일 목록 업로드 (동시 3) */
  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    if (!canUploadHere || !currentDriveFolderId) {
      showToast("폴더에 들어가서 업로드하세요.");
      return;
    }

    const confirmed = await askLargeUploadConfirm(list);
    if (!confirmed) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const folderId = currentDriveFolderId;
    const parentDbId = currentId;
    setFolderUploadFailures([]);
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
      uploadPercent: 0,
      uploadBytesSent: 0,
      uploadBytesTotal: file.size,
      uploadPaused: false,
      uploadStatusText: "준비 중…",
    }));

    setOptimisticRows((prev) => [...temps, ...prev]);
    setIsUploading(true);
    setUploadBanner(`업로드 중… 0/${list.length}`);

    const indexed = list.map((file, i) => ({ file, temp: temps[i]! }));
    let done = 0;
    await mapPool(indexed, 2, async ({ file, temp }) => {
      await uploadSingleResumable(file, folderId, parentDbId, temp.id);
      done += 1;
      setUploadBanner(`업로드 중… ${done}/${list.length}`);
    });

    setIsUploading(false);
    setUploadBanner(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    void refreshList();
  };

  /**
   * 폴더 트리 업로드: 폴더 API로 경로 재현 → 파일 순차 resumable 업로드
   */
  const uploadFolderTree = async (entries: PathFile[]) => {
    if (entries.length === 0) return;
    if (!canUploadHere || !currentDriveFolderId) {
      showToast("폴더에 들어가서 업로드하세요.");
      return;
    }

    const confirmed = await askLargeUploadConfirm(entries.map((e) => e.file));
    if (!confirmed) {
      if (folderInputRef.current) folderInputRef.current.value = "";
      return;
    }

    const rootDriveId = currentDriveFolderId;
    setFolderUploadFailures([]);
    setIsUploading(true);

    const folderPaths = folderPathsFromEntries(entries);
    /** relative folder path → Google drive folder id */
    const driveIdByPath = new Map<string, string>();

    setUploadBanner(`폴더 구조 생성 중… (0/${folderPaths.length})`);
    for (let i = 0; i < folderPaths.length; i++) {
      const path = folderPaths[i]!;
      const parts = path.split("/");
      const name = parts[parts.length - 1]!;
      const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
      const parentDrive =
        parentPath != null ? driveIdByPath.get(parentPath) : rootDriveId;
      if (!parentDrive) {
        showToast(`상위 폴더를 찾지 못했습니다: ${path}`);
        setIsUploading(false);
        setUploadBanner(null);
        return;
      }
      const created = await postExplorerFolder(name, parentDrive);
      if (!created.ok) {
        showToast(`폴더 「${path}」 생성 실패: ${created.error}`);
        setIsUploading(false);
        setUploadBanner(null);
        return;
      }
      driveIdByPath.set(path, created.file.driveFileId);
      setUploadBanner(`폴더 구조 생성 중… (${i + 1}/${folderPaths.length})`);
    }

    const failures: FolderUploadFailure[] = [];
    const total = entries.length;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const parentPath = parentFolderPath(entry.relativePath);
      const parentDriveId =
        parentPath != null ? driveIdByPath.get(parentPath) ?? rootDriveId : rootDriveId;

      const sizeCheck = assertExplorerUploadSize(entry.file.size);
      if (!sizeCheck.ok) {
        failures.push({
          relativePath: entry.relativePath,
          file: entry.file,
          parentDriveId,
          error: sizeCheck.error,
        });
        setUploadBanner(`파일 업로드 ${i + 1}/${total} (실패 ${failures.length})`);
        continue;
      }

      const tempId = `uploading-folder-${Date.now()}-${i}`;
      setOptimisticRows((prev) => [
        {
          id: tempId,
          name: entry.file.name,
          mimeType: entry.file.type || null,
          size: String(entry.file.size),
          isFolder: false,
          driveFileId: null,
          webViewLink: null,
          driveModifiedAt: null,
          parentId: parentDriveId === rootDriveId ? currentId : null,
          uploading: true,
          uploadPercent: 0,
          uploadBytesSent: 0,
          uploadBytesTotal: entry.file.size,
          uploadPaused: false,
          uploadStatusText: entry.relativePath,
        },
        ...prev,
      ]);

      setUploadBanner(`파일 업로드 ${i + 1}/${total} — ${entry.relativePath}`);
      const result = await uploadSingleResumable(
        entry.file,
        parentDriveId,
        parentDriveId === rootDriveId ? currentId : null,
        tempId
      );
      if (!result.ok) {
        failures.push({
          relativePath: entry.relativePath,
          file: entry.file,
          parentDriveId,
          error: result.error,
        });
      }
    }

    setFolderUploadFailures(failures);
    setIsUploading(false);
    setUploadBanner(
      failures.length > 0
        ? `폴더 업로드 완료 — 실패 ${failures.length}/${total}`
        : `폴더 업로드 완료 — ${total}개 파일`
    );
    if (folderInputRef.current) folderInputRef.current.value = "";
    void refreshList();
    if (failures.length === 0) {
      window.setTimeout(() => setUploadBanner(null), 4000);
    }
  };

  const retryFolderFailures = async () => {
    if (folderUploadFailures.length === 0 || isUploading) return;
    const queue = [...folderUploadFailures];
    setFolderUploadFailures([]);
    setIsUploading(true);
    const still: FolderUploadFailure[] = [];
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i]!;
      setUploadBanner(`실패 재시도 ${i + 1}/${queue.length} — ${item.relativePath}`);
      try {
        await uploadExplorerFileResumable(item.file, item.parentDriveId);
      } catch (e) {
        still.push({
          ...item,
          error: e instanceof Error ? e.message : "업로드 실패",
        });
      }
    }
    setFolderUploadFailures(still);
    setIsUploading(false);
    setUploadBanner(
      still.length > 0
        ? `재시도 후에도 실패 ${still.length}건`
        : "실패 항목 재업로드 완료"
    );
    void refreshList();
    if (still.length === 0) {
      window.setTimeout(() => setUploadBanner(null), 4000);
    }
  };

  const handleDropUpload = async (dt: DataTransfer) => {
    if (!canUploadHere) {
      showToast("폴더에 들어가서 업로드하세요.");
      return;
    }
    const { entries, hadDirectory } = await filesFromDataTransfer(dt);
    if (entries.length === 0) return;
    if (hadDirectory || entries.some((e) => e.relativePath.includes("/"))) {
      await uploadFolderTree(entries);
    } else {
      await uploadFiles(entries.map((e) => e.file));
    }
  };

  const openNewFolderInput = () => {
    if (!canCreateFolderHere) {
      showToast("폴더에 들어가서 새 폴더를 만드세요.");
      return;
    }
    setNewFolderOpen(true);
    setNewFolderName("");
    window.setTimeout(() => newFolderInputRef.current?.focus(), 0);
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      showToast("폴더 이름을 입력하세요.");
      return;
    }
    if (!canCreateFolderHere || !currentDriveFolderId) {
      showToast("폴더에 들어가서 새 폴더를 만드세요.");
      return;
    }
    if (isCreatingFolder) return;

    const parentDbId = currentId;
    const tempId = `creating-folder-${Date.now()}`;
    const temp: DriveFileRow = {
      id: tempId,
      name,
      mimeType: "application/vnd.google-apps.folder",
      size: null,
      isFolder: true,
      driveFileId: null,
      webViewLink: null,
      driveModifiedAt: null,
      parentId: parentDbId,
      creating: true,
      _count: { children: 0 },
    };

    setOptimisticRows((prev) => [temp, ...prev]);
    setIsCreatingFolder(true);
    setNewFolderOpen(false);
    setNewFolderName("");

    try {
      const result = await postExplorerFolder(name, currentDriveFolderId);
      if (!result.ok) {
        setOptimisticRows((prev) => prev.filter((r) => r.id !== tempId));
        showToast(result.error);
        return;
      }
      const f = result.file as DriveFileRow;
      setOptimisticRows((prev) =>
        prev.map((r) =>
          r.id === tempId
            ? {
                ...f,
                creating: false,
                driveModifiedAt: f.driveModifiedAt ?? new Date().toISOString(),
                _count: f._count ?? { children: 0 },
              }
            : r
        )
      );
      await mutate(
        listUrl,
        (cur: ListPayload | undefined) => {
          if (!cur) return cur;
          const without = cur.files.filter((x) => x.id !== f.id);
          return { ...cur, files: [f, ...without] };
        },
        { revalidate: false }
      );
      setOptimisticRows((prev) => prev.filter((r) => r.id !== tempId));
      void refreshList();
    } catch (e) {
      setOptimisticRows((prev) => prev.filter((r) => r.id !== tempId));
      showToast(e instanceof Error ? e.message : "폴더 생성 실패");
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const openCreatePicker = (type: "document" | "spreadsheet" | "presentation") => {
    if (!explorerConfigured) {
      showToast("직원용 공유 드라이브가 연결되지 않았습니다.");
      return;
    }
    if (!currentDriveFolderId) {
      showToast("폴더에 들어간 뒤 작성하거나, 피커에서 저장 위치를 고르세요.");
    }
    setPendingCreateType(type);
    setPickerOpen(true);
  };

  const handlePickerConfirm = async (selection: FolderPickerSelection) => {
    const type = pendingCreateType;
    setPendingCreateType(null);
    if (!type) return;
    if (isCreatingFile) return;
    setIsCreatingFile(true);
    try {
      const res = await fetch("/api/drive/create-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, folderId: selection.driveFolderId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(body?.error || "파일 생성 실패");
        return;
      }
      const file = body.file as {
        webViewLink?: string | null;
        name?: string;
        folderName?: string;
        folderDriveId?: string;
      };
      if (file?.webViewLink) {
        window.open(file.webViewLink, "_blank", "noopener,noreferrer");
      }
      const savedInCurrent =
        selection.driveFolderId === currentDriveFolderId ||
        file?.folderDriveId === currentDriveFolderId;
      if (savedInCurrent) {
        void refreshList();
        showToast(`「${file?.name ?? "파일"}」을(를) 만들었습니다.`);
      } else {
        showToast(`「${selection.name}」 폴더에 저장됨`);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "파일 생성 실패");
    } finally {
      setIsCreatingFile(false);
    }
  };

  const handleDelete = async (file: DriveFileRow) => {
    if (file.uploading || file.creating) return;
    if (file.isFolder) {
      if (
        !canManageExplorerFolderTrash({
          role: viewerRole,
          actorId: viewerUserId,
          createdBy: file.createdBy,
        })
      ) {
        return;
      }
    } else if (
      !canTrashExplorerFile({
        role: viewerRole,
        actorId: viewerUserId,
        createdBy: file.createdBy,
      })
    ) {
      return;
    }
    const ok = window.confirm(
      file.isFolder
        ? "폴더를 휴지통으로 이동합니다. (하위 항목 포함)"
        : "드라이브 휴지통으로 이동합니다"
    );
    if (!ok) return;

    setDeletingId(file.id);
    try {
      const res = await fetch(`/api/drive/file/${encodeURIComponent(file.id)}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "삭제 실패");
      if (previewFile?.id === file.id) setPreviewFile(null);
      // 삭제 후 15초간 해당 폴더 자동 동기화 억제 (유령 부활 방지)
      markDeleteSyncSuppress(syncThrottleKey(currentId, currentDriveFolderId));
      await refreshList();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setDeletingId(null);
    }
  };

  /** JIT 권한 부여 후 구글 Drive에서 열기 (탐색기 파일 전용) */
  const openFileInGoogle = async (file: DriveFileRow) => {
    if (file.isFolder || file.uploading || file.creating) return;
    if (openingId) return;
    setOpeningId(file.id);
    try {
      const res = await fetch(`/api/drive/file/${encodeURIComponent(file.id)}/open`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const hint =
          typeof body?.accountHint === "string"
            ? body.accountHint
            : typeof body?.hintEmail === "string"
              ? `CRM에 등록된 이메일(${body.hintEmail})로 구글 로그인 후 다시 열어주세요.`
              : null;
        throw new Error(
          [body?.error || "파일을 열 수 없습니다.", hint].filter(Boolean).join(" ")
        );
      }
      const link = typeof body.webViewLink === "string" ? body.webViewLink : null;
      if (!link) throw new Error("열기 링크를 받지 못했습니다.");
      window.open(link, "_blank", "noopener,noreferrer");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "파일 열기 실패");
    } finally {
      setOpeningId(null);
    }
  };

  /** 인앱 미리보기: JIT 부여 후 iframe(Drive preview) */
  const openFilePreview = async (file: DriveFileRow) => {
    if (file.isFolder || file.uploading || file.creating) return;
    if (openingId) return;
    setOpeningId(file.id);
    try {
      const res = await fetch(`/api/drive/file/${encodeURIComponent(file.id)}/open`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const hint =
          typeof body?.accountHint === "string"
            ? body.accountHint
            : typeof body?.hintEmail === "string"
              ? `CRM에 등록된 이메일(${body.hintEmail})로 구글 로그인 후 다시 열어주세요.`
              : null;
        throw new Error(
          [body?.error || "미리보기를 열 수 없습니다.", hint].filter(Boolean).join(" ")
        );
      }
      setPreviewFile({
        ...file,
        webViewLink:
          typeof body.webViewLink === "string" ? body.webViewLink : file.webViewLink,
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "미리보기 실패");
    } finally {
      setOpeningId(null);
    }
  };

  const canShowDeleteButton = (file: DriveFileRow) => {
    if (file.uploading || file.creating) return false;
    if (file.isFolder) {
      return canManageExplorerFolderTrash({
        role: viewerRole,
        actorId: viewerUserId,
        createdBy: file.createdBy,
      });
    }
    return canTrashExplorerFile({
      role: viewerRole,
      actorId: viewerUserId,
      createdBy: file.createdBy,
    });
  };

  const canShowRenameButton = (file: DriveFileRow) => {
    if (file.uploading || file.creating) return false;
    return canRenameExplorerItem({
      role: viewerRole,
      actorId: viewerUserId,
      createdBy: file.createdBy,
      isFolder: file.isFolder,
    });
  };

  const startRename = (file: DriveFileRow) => {
    if (!canShowRenameButton(file)) return;
    setRenamingId(file.id);
    setRenameDraft(file.name);
    window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
  };

  const cancelRename = () => {
    if (renameSaving) return;
    setRenamingId(null);
    setRenameDraft("");
  };

  const submitRename = async () => {
    if (!renamingId || renameSaving) return;
    const target = displayFiles.find((f) => f.id === renamingId);
    if (!target) {
      cancelRename();
      return;
    }
    const next = renameDraft.trim();
    if (!next) {
      showToast("이름을 입력하세요.");
      return;
    }
    if (next === target.name) {
      cancelRename();
      return;
    }

    setRenameSaving(true);
    const previousName = target.name;
    // 낙관적 반영
    setOptimisticRows((prev) => {
      const without = prev.filter((r) => r.id !== target.id);
      return [{ ...target, name: next }, ...without];
    });
    await mutate(
      listUrl,
      (cur: ListPayload | undefined) => {
        if (!cur) return cur;
        return {
          ...cur,
          files: cur.files.map((f) => (f.id === target.id ? { ...f, name: next } : f)),
        };
      },
      { revalidate: false }
    );

    try {
      const res = await fetch(`/api/drive/file/${encodeURIComponent(target.id)}/rename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "이름 변경 실패");
      const serverName =
        typeof body?.file?.name === "string" ? body.file.name : next;
      await mutate(
        listUrl,
        (cur: ListPayload | undefined) => {
          if (!cur) return cur;
          return {
            ...cur,
            files: cur.files.map((f) =>
              f.id === target.id ? { ...f, name: serverName } : f
            ),
          };
        },
        { revalidate: false }
      );
      setOptimisticRows((prev) => prev.filter((r) => r.id !== target.id));
      // 브레드크럼에 있으면 이름 갱신
      setBreadcrumb((prev) =>
        prev.map((c) => (c.id === target.id ? { ...c, name: serverName } : c))
      );
      setRenamingId(null);
      setRenameDraft("");
    } catch (e) {
      // 원래 이름 복구
      setOptimisticRows((prev) => prev.filter((r) => r.id !== target.id));
      await mutate(
        listUrl,
        (cur: ListPayload | undefined) => {
          if (!cur) return cur;
          return {
            ...cur,
            files: cur.files.map((f) =>
              f.id === target.id ? { ...f, name: previousName } : f
            ),
          };
        },
        { revalidate: false }
      );
      showToast(e instanceof Error ? e.message : "이름 변경 실패");
      setRenameDraft(previousName);
    } finally {
      setRenameSaving(false);
    }
  };

  const togglePin = async (file: DriveFileRow) => {
    if (file.uploading || file.creating) return;
    const next = !file.pinned;
    // 낙관적 반영
    await mutate(
      listUrl,
      (cur: ListPayload | undefined) => {
        if (!cur) return cur;
        return {
          ...cur,
          files: cur.files.map((f) =>
            f.id === file.id ? { ...f, pinned: next } : f
          ),
        };
      },
      { revalidate: false }
    );
    setOptimisticRows((prev) =>
      prev.map((r) => (r.id === file.id ? { ...r, pinned: next } : r))
    );
    try {
      const res = await fetch(`/api/drive/file/${encodeURIComponent(file.id)}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "고정 실패");
    } catch (e) {
      await mutate(
        listUrl,
        (cur: ListPayload | undefined) => {
          if (!cur) return cur;
          return {
            ...cur,
            files: cur.files.map((f) =>
              f.id === file.id ? { ...f, pinned: !next } : f
            ),
          };
        },
        { revalidate: false }
      );
      setOptimisticRows((prev) =>
        prev.map((r) => (r.id === file.id ? { ...r, pinned: !next } : r))
      );
      showToast(e instanceof Error ? e.message : "고정 실패");
    }
  };

  const openFolder = (folder: DriveFileRow) => {
    if (!folder.driveFileId) {
      showToast("이 폴더는 아직 Drive와 연결되지 않았습니다.");
      return;
    }
    setCurrentId(folder.id);
    setBreadcrumb((prev) => [
      ...prev,
      { id: folder.id, name: folder.name, driveFileId: folder.driveFileId },
    ]);
    setSearch("");
    setOptimisticRows([]);
    appliedFolderRef.current = folder.driveFileId;
    setNavReady(true);
    navigateToDriveFolder(folder.driveFileId);
  };

  const goTo = (index: number) => {
    const target = breadcrumb[index];
    if (!target) return;
    setCurrentId(target.id);
    setBreadcrumb(breadcrumb.slice(0, index + 1));
    setSearch("");
    setOptimisticRows([]);
    appliedFolderRef.current = target.driveFileId;
    setNavReady(true);
    navigateToDriveFolder(target.driveFileId);
  };

  const goUp = () => {
    if (breadcrumb.length <= 1) return;
    goTo(breadcrumb.length - 2);
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
          <div className="ml-1 flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="뒤로"
              aria-label="뒤로"
              onClick={() => router.back()}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="앞으로"
              aria-label="앞으로"
              onClick={() => router.forward()}
            >
              <ArrowRight className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="상위 폴더"
              aria-label="상위 폴더"
              disabled={!canGoUp}
              onClick={goUp}
            >
              <ArrowUp className="size-4" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDriveAdmin && (
            <>
              <Button type="button" variant="ghost" size="sm" className="text-xs" asChild>
                <Link href="/drive/trash">휴지통</Link>
              </Button>
              <Button type="button" variant="ghost" size="sm" className="text-xs" asChild>
                <Link href="/drive/activity">이력</Link>
              </Button>
            </>
          )}
          {(isValidating || isAutoSyncing) && !isLoading && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              새로고침 중…
            </span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void uploadFiles(e.target.files);
            }}
          />
          <input
            ref={(el) => {
              folderInputRef.current = el;
              if (el) {
                el.setAttribute("webkitdirectory", "");
                el.setAttribute("directory", "");
              }
            }}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                void uploadFolderTree(filesFromFileList(e.target.files));
              }
            }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
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
                        : "현재 폴더에 파일·폴더 업로드"
                }
              >
                {isUploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                {isUploading ? "업로드 중…" : "+ 업로드"}
                <ChevronDown className="size-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                className="gap-2"
                disabled={!canUploadHere || isUploading}
                onSelect={() => fileInputRef.current?.click()}
              >
                <Plus className="size-4" />
                파일 업로드
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                disabled={!canUploadHere || isUploading}
                onSelect={() => folderInputRef.current?.click()}
              >
                <FolderPlus className="size-4" />
                폴더 업로드
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="gap-1.5"
                disabled={!explorerConfigured || isCreatingFile || Boolean(search.trim())}
                title={
                  !explorerConfigured
                    ? "직원용 공유 드라이브가 연결되지 않았습니다"
                    : search.trim()
                      ? "검색 중에는 작성할 수 없습니다"
                      : "문서·스프레드시트·슬라이드 작성"
                }
              >
                {isCreatingFile ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileText className="size-4" />
                )}
                {isCreatingFile ? "작성 중…" : "작성"}
                <ChevronDown className="size-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => openCreatePicker("document")}
              >
                <FileText className="size-4" />
                문서
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => openCreatePicker("spreadsheet")}
              >
                <FileSpreadsheet className="size-4" />
                스프레드시트
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => openCreatePicker("presentation")}
              >
                <Presentation className="size-4" />
                슬라이드
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!canCreateFolderHere || isCreatingFolder}
            title={
              !explorerConfigured
                ? "직원용 공유 드라이브가 연결되지 않았습니다"
                : !currentDriveFolderId
                  ? "루트에서는 새 폴더를 만들 수 없습니다. 01~05 폴더 안에서 생성하세요"
                  : search.trim()
                    ? "검색 중에는 폴더를 만들 수 없습니다"
                    : "현재 폴더에 새 폴더 만들기"
            }
            onClick={openNewFolderInput}
          >
            {isCreatingFolder ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FolderPlus className="size-4" />
            )}
            {isCreatingFolder ? "생성 중…" : "+ 새 폴더"}
          </Button>
          {newFolderOpen && (
            <Input
              ref={newFolderInputRef}
              type="text"
              placeholder="폴더 이름"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void createFolder();
                }
                if (e.key === "Escape") {
                  setNewFolderOpen(false);
                  setNewFolderName("");
                }
              }}
              onBlur={() => {
                if (!newFolderName.trim()) {
                  setNewFolderOpen(false);
                }
              }}
              className="h-9 w-[180px]"
              disabled={isCreatingFolder}
              aria-label="새 폴더 이름"
            />
          )}
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
          <div className="flex items-center rounded-md border" role="group" aria-label="표시 방식">
            <button
              type="button"
              title="목록 보기"
              aria-pressed={viewMode === "list"}
              onClick={() => changeViewMode("list")}
              className={cn(
                "text-muted-foreground hover:bg-muted/80 rounded-l-md p-1.5 transition-colors",
                viewMode === "list" && "bg-muted text-foreground"
              )}
            >
              <Rows3 className="size-4" />
            </button>
            <button
              type="button"
              title="그리드 보기"
              aria-pressed={viewMode === "grid"}
              onClick={() => changeViewMode("grid")}
              className={cn(
                "text-muted-foreground hover:bg-muted/80 rounded-r-md border-l p-1.5 transition-colors",
                viewMode === "grid" && "bg-muted text-foreground"
              )}
            >
              <LayoutGrid className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {uploadBanner && (
        <div
          className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950"
          role="status"
        >
          {uploadBanner}
        </div>
      )}

      {folderUploadFailures.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">업로드 실패 {folderUploadFailures.length}건</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={isUploading}
              onClick={() => void retryFolderFailures()}
            >
              실패 항목 재시도
            </Button>
          </div>
          <ul className="mt-2 max-h-28 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
            {folderUploadFailures.slice(0, 20).map((f) => (
              <li key={f.relativePath}>
                {f.relativePath}: {f.error}
              </li>
            ))}
            {folderUploadFailures.length > 20 && (
              <li>…외 {folderUploadFailures.length - 20}건</li>
            )}
          </ul>
        </div>
      )}

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
          void handleDropUpload(e.dataTransfer);
        }}
      >
        {dragOver && canUploadHere && (
          <div className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-center text-sm text-sky-800">
            여기에 파일·폴더를 놓으면 현재 폴더에 업로드됩니다
          </div>
        )}

        {(!navReady || (isLoading && !data)) && (
          <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            불러오는 중…
          </div>
        )}

        {navReady && error && !isLoading && !data && (
          <div className="px-4 py-16 text-center text-sm text-rose-600">
            {error instanceof Error ? error.message : "목록을 불러오지 못했습니다."}
          </div>
        )}

        {viewMode === "list" && (
          <>
        <div className="grid grid-cols-[minmax(0,2fr)_120px_100px_minmax(220px,1.2fr)] gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-medium text-muted-foreground">
          <span>이름</span>
          <span>수정일</span>
          <span>크기</span>
          <span>작업</span>
        </div>

        {navReady &&
          displayFiles.map((file) => (
          <div
            key={file.id}
            role="row"
            tabIndex={0}
            onMouseEnter={() => {
              if (file.isFolder && !file.uploading && !file.creating) prefetchFolder(file.id);
            }}
            onDoubleClick={() => {
              if (file.uploading || file.creating || renamingId === file.id) return;
              if (file.isFolder) openFolder(file);
              else void openFilePreview(file);
            }}
            onKeyDown={(e) => {
              if (renamingId === file.id) return;
              if (e.key === "Enter" && !file.uploading && !file.creating) {
                if (file.isFolder) openFolder(file);
                else void openFilePreview(file);
              }
            }}
            className={cn(
              "grid grid-cols-[minmax(0,2fr)_120px_100px_minmax(220px,1.2fr)] items-center gap-2 border-b border-gray-100 px-4 py-2.5 text-sm",
              file.uploading || file.creating
                ? "bg-gray-50 text-muted-foreground"
                : "hover:bg-gray-50"
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              {file.uploading || file.creating ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-gray-400" />
              ) : (
                <FileTypeIcon mimeType={file.mimeType} isFolder={file.isFolder} />
              )}
              {renamingId === file.id ? (
                <Input
                  ref={renameInputRef}
                  type="text"
                  value={renameDraft}
                  disabled={renameSaving}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void submitRename();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cancelRename();
                    }
                  }}
                  onBlur={() => {
                    if (!renameSaving && !renameDraft.trim()) {
                      cancelRename();
                    }
                  }}
                  className="h-8 max-w-full flex-1"
                  aria-label="새 이름"
                />
              ) : (
                <span
                  className={cn(
                    "truncate font-medium",
                    file.uploading || file.creating ? "text-gray-500" : "text-gray-900"
                  )}
                >
                  {file.pinned ? (
                    <Pin className="mr-1 inline size-3.5 -translate-y-px text-amber-600" aria-hidden />
                  ) : null}
                  {file.creating
                    ? `${file.name} (생성 중…)`
                    : file.uploading
                      ? `${file.name}`
                      : file.name}
                </span>
              )}
              {file.uploading && typeof file.uploadPercent === "number" && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {file.uploadPercent}%
                  {typeof file.uploadBytesTotal === "number" &&
                  typeof file.uploadBytesSent === "number"
                    ? ` · 남음 ${formatUploadBytes(
                        Math.max(0, file.uploadBytesTotal - file.uploadBytesSent)
                      )}`
                    : null}
                </span>
              )}
              {file.isFolder && !file.creating && renamingId !== file.id && (file._count?.children ?? 0) > 0 && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  ({file._count?.children})
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {file.uploading || file.creating
                ? "—"
                : file.driveModifiedAt
                  ? new Date(file.driveModifiedAt).toLocaleDateString("ko")
                  : "—"}
            </span>
            <span className="text-xs text-muted-foreground">
              {file.isFolder ? "—" : formatSize(file.size)}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {file.creating ? (
                <span className="text-xs text-muted-foreground">생성 중</span>
              ) : file.uploading ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="max-w-[140px] truncate text-xs text-muted-foreground" title={file.uploadStatusText ?? undefined}>
                    {file.uploadPaused
                      ? "일시정지"
                      : file.uploadStatusText ||
                        (typeof file.uploadPercent === "number"
                          ? `${file.uploadPercent}%`
                          : "업로드 중")}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleUploadPause(file.id);
                    }}
                  >
                    {file.uploadPaused ? (
                      <>
                        <Play className="size-3.5" />
                        재개
                      </>
                    ) : (
                      <>
                        <Pause className="size-3.5" />
                        일시정지
                      </>
                    )}
                  </Button>
                </div>
              ) : file.isFolder ? (
                <>
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    title={file.pinned ? "고정 해제" : "상단 고정"}
                    onClick={(e) => {
                      e.stopPropagation();
                      void togglePin(file);
                    }}
                  >
                    {file.pinned ? (
                      <PinOff className="size-3.5" />
                    ) : (
                      <Pin className="size-3.5" />
                    )}
                    {file.pinned ? "고정 해제" : "고정"}
                  </Button>
                  {canShowRenameButton(file) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      disabled={renameSaving && renamingId === file.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (renamingId === file.id) void submitRename();
                        else startRename(file);
                      }}
                    >
                      {renameSaving && renamingId === file.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Pencil className="size-3.5" />
                      )}
                      {renamingId === file.id ? "저장" : "이름 변경"}
                    </Button>
                  )}
                  {canShowDeleteButton(file) && (
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
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={openingId === file.id}
                    onClick={() => void openFilePreview(file)}
                  >
                    {openingId === file.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : null}
                    미리보기
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs text-sky-700"
                    disabled={openingId === file.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void openFileInGoogle(file);
                    }}
                  >
                    구글에서 열기
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    title={file.pinned ? "고정 해제" : "상단 고정"}
                    onClick={(e) => {
                      e.stopPropagation();
                      void togglePin(file);
                    }}
                  >
                    {file.pinned ? (
                      <PinOff className="size-3.5" />
                    ) : (
                      <Pin className="size-3.5" />
                    )}
                    {file.pinned ? "고정 해제" : "고정"}
                  </Button>
                  {canShowRenameButton(file) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      disabled={renameSaving && renamingId === file.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (renamingId === file.id) void submitRename();
                        else startRename(file);
                      }}
                    >
                      {renameSaving && renamingId === file.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Pencil className="size-3.5" />
                      )}
                      {renamingId === file.id ? "저장" : "이름 변경"}
                    </Button>
                  )}
                  {canShowDeleteButton(file) && (
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
          </>
        )}

        {viewMode === "grid" && navReady && !error && (
          <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {displayFiles.map((file) => {
              const busy = Boolean(file.uploading || file.creating);
              const hasThumb = mayHaveDriveThumbnail(
                file.mimeType,
                file.isFolder,
                file.thumbnailLink
              );
              return (
                <li
                  key={file.id}
                  className={cn(
                    "group relative flex flex-col overflow-hidden rounded-lg border bg-white",
                    busy ? "opacity-70" : "hover:border-sky-300 hover:shadow-sm"
                  )}
                >
                  <button
                    type="button"
                    className="relative aspect-square w-full overflow-hidden bg-gray-50"
                    disabled={busy || renamingId === file.id}
                    onClick={() => {
                      if (busy || renamingId === file.id) return;
                      if (file.isFolder) openFolder(file);
                      else void openFilePreview(file);
                    }}
                    onDoubleClick={() => {
                      if (busy || renamingId === file.id) return;
                      if (file.isFolder) openFolder(file);
                      else void openFilePreview(file);
                    }}
                    title={file.name}
                  >
                    {busy ? (
                      <div className="flex h-full items-center justify-center">
                        <Loader2 className="size-8 animate-spin text-gray-400" />
                      </div>
                    ) : (
                      <DriveThumb
                        fileId={file.id}
                        mimeType={file.mimeType}
                        isFolder={file.isFolder}
                        hasThumbHint={hasThumb}
                      />
                    )}
                    {file.pinned && !busy && (
                      <span className="absolute left-1.5 top-1.5 rounded bg-amber-500/90 p-0.5 text-white shadow">
                        <Pin className="size-3.5" aria-label="고정됨" />
                      </span>
                    )}
                  </button>
                  <div className="flex items-start gap-1 border-t px-2 py-1.5">
                    {renamingId === file.id ? (
                      <Input
                        ref={renameInputRef}
                        type="text"
                        value={renameDraft}
                        disabled={renameSaving}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void submitRename();
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            cancelRename();
                          }
                        }}
                        className="h-7 flex-1 text-xs"
                        aria-label="새 이름"
                      />
                    ) : (
                      <p className="min-w-0 flex-1 truncate text-xs font-medium text-gray-900" title={file.name}>
                        {file.name}
                      </p>
                    )}
                    {!busy && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 shrink-0 p-0 opacity-70 group-hover:opacity-100"
                            onClick={(e) => e.stopPropagation()}
                            aria-label="더보기"
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          {file.isFolder ? (
                            <DropdownMenuItem
                              onSelect={() => openFolder(file)}
                            >
                              열기
                            </DropdownMenuItem>
                          ) : (
                            <>
                              <DropdownMenuItem
                                onSelect={() => void openFilePreview(file)}
                              >
                                미리보기
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => void openFileInGoogle(file)}
                              >
                                구글에서 열기
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuItem onSelect={() => void togglePin(file)}>
                            {file.pinned ? "고정 해제" : "상단 고정"}
                          </DropdownMenuItem>
                          {canShowRenameButton(file) && (
                            <DropdownMenuItem
                              onSelect={() => {
                                if (renamingId === file.id) void submitRename();
                                else startRename(file);
                              }}
                            >
                              {renamingId === file.id ? "저장" : "이름 변경"}
                            </DropdownMenuItem>
                          )}
                          {canShowDeleteButton(file) && (
                            <DropdownMenuItem
                              className="text-rose-700"
                              onSelect={() => void handleDelete(file)}
                            >
                              삭제
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  {file.uploading && typeof file.uploadPercent === "number" && (
                    <div className="border-t px-2 py-1 text-[10px] text-muted-foreground">
                      {file.uploadPaused
                        ? "일시정지"
                        : `${file.uploadPercent}% · 남음 ${formatUploadBytes(
                            Math.max(
                              0,
                              (file.uploadBytesTotal ?? 0) - (file.uploadBytesSent ?? 0)
                            )
                          )}`}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {!navReady || isLoading || error ? null : displayFiles.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-muted-foreground">
            {search.trim()
              ? `"${search.trim()}" 검색 결과가 없습니다`
              : canUploadHere
                ? "이 폴더는 비어 있습니다. 파일을 끌어다 놓거나 업로드 버튼을 사용하세요."
                : "이 폴더는 비어 있습니다. 「이 폴더 새로고침」으로 Drive에서 가져와 주세요."}
          </div>
        ) : null}
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
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1 bg-sky-600 text-xs text-white hover:bg-sky-700"
                  disabled={openingId === previewFile.id}
                  onClick={() => void openFileInGoogle(previewFile)}
                >
                  구글에서 열기
                </Button>
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

      <FolderPickerModal
        open={pickerOpen}
        onOpenChange={(next) => {
          setPickerOpen(next);
          if (!next) setPendingCreateType(null);
        }}
        initialDriveFolderId={currentDriveFolderId}
        initialDbId={currentId}
        onConfirm={(selection) => {
          void handlePickerConfirm(selection);
        }}
        title={
          pendingCreateType === "spreadsheet"
            ? "스프레드시트 저장 위치"
            : pendingCreateType === "presentation"
              ? "슬라이드 저장 위치"
              : "문서 저장 위치"
        }
      />

      <Dialog
        open={largeConfirmOpen}
        onOpenChange={(open) => {
          if (!open) resolveLargeConfirm(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>대용량 업로드 확인</DialogTitle>
            <DialogDescription className="whitespace-pre-line text-left">
              {largeConfirmMessage}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => resolveLargeConfirm(false)}>
              취소
            </Button>
            <Button type="button" onClick={() => resolveLargeConfirm(true)}>
              계속
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
