"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Folder, FolderPlus, Loader2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { postExplorerFolder } from "@/lib/drive/explorer-folder-api";

type FolderRow = {
  id: string;
  name: string;
  isFolder: boolean;
  driveFileId: string | null;
  parentId: string | null;
};

type Crumb = {
  id: string | null;
  name: string;
  driveFileId: string | null;
};

export type FolderPickerSelection = {
  /** Google Drive 폴더 ID — create-file / folder API용 */
  driveFolderId: string;
  /** DB DriveFile id */
  dbId: string;
  name: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 탐색기에서 보고 있던 Google 폴더 ID (루트면 null) */
  initialDriveFolderId: string | null;
  /** 탐색기 currentId (DB) */
  initialDbId: string | null;
  onConfirm: (selection: FolderPickerSelection) => void;
  title?: string;
  description?: string;
  /** 확인 버튼 문구 (기본: 여기에 저장) */
  confirmLabel?: string;
};

async function fetchFolders(parentDbId: string | null): Promise<FolderRow[]> {
  const q =
    parentDbId != null && parentDbId !== ""
      ? `?parentId=${encodeURIComponent(parentDbId)}`
      : "";
  const res = await fetch(`/api/drive/files${q}`);
  const body = (await res.json().catch(() => ({}))) as {
    files?: FolderRow[];
    error?: string;
  };
  if (!res.ok) throw new Error(body.error || "폴더 목록을 불러오지 못했습니다.");
  return (body.files ?? []).filter((f) => f.isFolder);
}

async function fetchBreadcrumb(driveFolderId: string): Promise<Crumb[]> {
  const res = await fetch(
    `/api/drive/breadcrumb?folder=${encodeURIComponent(driveFolderId)}`
  );
  const body = (await res.json().catch(() => ({}))) as {
    path?: { id: string; name: string; driveFileId: string | null }[];
  };
  if (!res.ok || !Array.isArray(body.path)) {
    throw new Error("경로를 불러오지 못했습니다.");
  }
  return [
    { id: null, name: "전체 파일", driveFileId: null },
    ...body.path.map((p) => ({
      id: p.id,
      name: p.name,
      driveFileId: p.driveFileId,
    })),
  ];
}

/**
 * 저장 위치 선택 모달.
 * 메인 탐색기 URL/currentId와 분리된 자체 상태로만 폴더를 탐색한다.
 */
export function FolderPickerModal({
  open,
  onOpenChange,
  initialDriveFolderId,
  initialDbId,
  onConfirm,
  title = "저장 위치 선택",
  description = "문서를 만들 폴더를 선택한 뒤 「여기에 저장」을 누르세요.",
  confirmLabel = "여기에 저장",
}: Props) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([
    { id: null, name: "전체 파일", driveFileId: null },
  ]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const leaf = crumbs[crumbs.length - 1]!;
  const currentDbId = leaf.id;
  const currentDriveId = leaf.driveFileId;
  const canSaveHere = Boolean(currentDriveId && currentDbId);
  const canCreateHere = canSaveHere;

  const loadAt = useCallback(async (driveFolderId: string | null, dbId: string | null) => {
    setLoading(true);
    setError(null);
    setNewFolderOpen(false);
    setNewFolderName("");
    try {
      if (driveFolderId) {
        const path = await fetchBreadcrumb(driveFolderId);
        setCrumbs(path);
        const leafDb = path[path.length - 1]?.id ?? null;
        const list = await fetchFolders(leafDb);
        setFolders(list);
      } else {
        setCrumbs([{ id: null, name: "전체 파일", driveFileId: null }]);
        const list = await fetchFolders(dbId);
        setFolders(list);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadAt(initialDriveFolderId, initialDbId);
  }, [open, initialDriveFolderId, initialDbId, loadAt]);

  const enterFolder = async (folder: FolderRow) => {
    if (!folder.driveFileId) return;
    setLoading(true);
    setError(null);
    try {
      const path = await fetchBreadcrumb(folder.driveFileId);
      setCrumbs(path);
      const list = await fetchFolders(folder.id);
      setFolders(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "폴더를 열 수 없습니다.");
    } finally {
      setLoading(false);
    }
  };

  const goToCrumb = async (index: number) => {
    const target = crumbs[index];
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      const nextCrumbs = crumbs.slice(0, index + 1);
      setCrumbs(nextCrumbs);
      const list = await fetchFolders(target.id);
      setFolders(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "폴더를 열 수 없습니다.");
    } finally {
      setLoading(false);
    }
  };

  const goUp = () => {
    if (crumbs.length <= 1) return;
    void goToCrumb(crumbs.length - 2);
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setError("폴더 이름을 입력하세요.");
      return;
    }
    if (!currentDriveId) {
      setError("루트에서는 새 폴더를 만들 수 없습니다. 하위 폴더로 들어가세요.");
      return;
    }
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const result = await postExplorerFolder(name, currentDriveId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNewFolderOpen(false);
      setNewFolderName("");
      // 생성한 폴더로 바로 이동(선택)
      await enterFolder({
        id: result.file.id,
        name: result.file.name,
        isFolder: true,
        driveFileId: result.file.driveFileId,
        parentId: result.file.parentId,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "폴더 생성 실패");
    } finally {
      setCreating(false);
    }
  };

  const handleConfirm = () => {
    if (!currentDriveId || !currentDbId) return;
    onConfirm({
      driveFolderId: currentDriveId,
      dbId: currentDbId,
      name: leaf.name,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-5 py-4 text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            disabled={crumbs.length <= 1 || loading}
            onClick={goUp}
            title="상위 폴더"
            aria-label="상위 폴더"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-xs" aria-label="경로">
            {crumbs.map((c, i) => (
              <span key={`${c.id ?? "root"}-${i}`} className="flex min-w-0 items-center gap-1">
                {i > 0 && <span className="text-muted-foreground">/</span>}
                <button
                  type="button"
                  className={cn(
                    "max-w-[120px] truncate rounded px-1 py-0.5",
                    i < crumbs.length - 1
                      ? "text-sky-700 hover:bg-sky-50"
                      : "font-medium text-foreground"
                  )}
                  disabled={i === crumbs.length - 1 || loading}
                  onClick={() => void goToCrumb(i)}
                >
                  {c.name}
                </button>
              </span>
            ))}
          </nav>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1"
            disabled={!canCreateHere || creating || loading}
            onClick={() => {
              setNewFolderOpen(true);
              setNewFolderName("");
            }}
            title={
              canCreateHere
                ? "현재 위치에 새 폴더 만들기"
                : "루트에서는 새 폴더를 만들 수 없습니다"
            }
          >
            {creating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FolderPlus className="size-3.5" />
            )}
            새 폴더
          </Button>
        </div>

        {newFolderOpen && (
          <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
            <Input
              autoFocus
              placeholder="새 폴더 이름"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreateFolder();
                }
                if (e.key === "Escape") {
                  setNewFolderOpen(false);
                  setNewFolderName("");
                }
              }}
              disabled={creating}
              className="h-8"
              aria-label="새 폴더 이름"
            />
            <Button
              type="button"
              size="sm"
              disabled={creating || !newFolderName.trim()}
              onClick={() => void handleCreateFolder()}
            >
              만들기
            </Button>
          </div>
        )}

        <div className="min-h-[220px] flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex h-[200px] items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : error ? (
            <p className="px-3 py-6 text-center text-sm text-destructive">{error}</p>
          ) : folders.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {canSaveHere
                ? "하위 폴더가 없습니다. 이 위치에 저장하거나 새 폴더를 만드세요."
                : "폴더를 선택하려면 하위 항목을 열어 주세요. 루트에는 저장할 수 없습니다."}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {folders.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => void enterFolder(f)}
                    disabled={loading || !f.driveFileId}
                  >
                    <Folder className="size-4 shrink-0 text-amber-600" />
                    <span className="truncate">{f.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="gap-2 border-t px-5 py-3 sm:justify-between">
          <p className="text-muted-foreground self-center text-xs">
            {canSaveHere
              ? `선택: ${leaf.name}`
              : "위치를 고르려면 하위 폴더로 들어가세요"}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="button" disabled={!canSaveHere || loading} onClick={handleConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
