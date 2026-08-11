"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Plus, Inbox, Search, X, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserNoteCard } from "./user-note-card";
import { UserNoteTile } from "./user-note-tile";
import type { UserNoteDto } from "./types";
import { plainTextFromHtml } from "@/lib/sanitize-note-html";
import { contentToPlainText } from "@/lib/export/plain-from-content";

type BrandOption = { id: string; name: string };

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof (data as { error?: string }).error === "string" ? (data as { error: string }).error : "요청 실패");
  }
  return data as T;
}

/** API가 배열 또는 `{ notes: [] }` 둘 다 올 수 있도록 정규화 */
function normalizeNotesPayload(json: unknown): UserNoteDto[] {
  if (Array.isArray(json)) return json as UserNoteDto[];
  if (
    json &&
    typeof json === "object" &&
    "notes" in json &&
    Array.isArray((json as { notes: unknown }).notes)
  ) {
    return (json as { notes: UserNoteDto[] }).notes;
  }
  return [];
}

async function fetchNotesList(url: string): Promise<UserNoteDto[]> {
  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return [];
    }
    return normalizeNotesPayload(data);
  } catch {
    return [];
  }
}

function unwrapNotePayload(data: unknown): UserNoteDto {
  if (data && typeof data === "object" && "note" in data) {
    const n = (data as { note: UserNoteDto }).note;
    if (n && typeof n === "object" && "id" in n) return n;
  }
  return data as UserNoteDto;
}

function listUrlBuilder(projectId?: string) {
  return projectId ? `/api/user-notes?projectId=${encodeURIComponent(projectId)}` : "/api/user-notes";
}

type Props = {
  /** 설정 시 해당 프로젝트에 연결된 메모만 표시하고, 가져오기/추가 시 연결합니다. */
  projectId?: string;
  /** 페이지 상단 제목 (없으면 기본 문구) */
  heading?: string;
  description?: string;
  /** URL ?note= 등으로 바로 열 메모 id */
  initialNoteId?: string | null;
};

export function UserNotesBoard({ projectId, heading, description, initialNoteId }: Props) {
  const router = useRouter();
  const {
    data: notes = [],
    isLoading: loading,
    mutate,
  } = useSWR(listUrlBuilder(projectId), fetchNotesList, {
    revalidateOnFocus: true,
    onError: () => {},
    fallbackData: [],
  });
  const [importOpen, setImportOpen] = useState(false);
  const [unlinked, setUnlinked] = useState<UserNoteDto[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [convertNote, setConvertNote] = useState<UserNoteDto | null>(null);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [brandId, setBrandId] = useState("");
  const [converting, setConverting] = useState(false);
  const [canConvertProject, setCanConvertProject] = useState(false);
  const [search, setSearch] = useState("");
  /** 편집기는 한 번에 한 건만 띄운다 */
  const [openNoteId, setOpenNoteId] = useState<string | null>(initialNoteId ?? null);

  // 빠른 메모·공유 링크에서 ?note=id 로 들어오면 편집창을 연다
  useEffect(() => {
    if (!initialNoteId) return;
    if (!notes.some((n) => n.id === initialNoteId)) return;
    setOpenNoteId(initialNoteId);
  }, [initialNoteId, notes]);

  const clearNoteQuery = () => {
    if (!initialNoteId || projectId) return;
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("note")) return;
      url.searchParams.delete("note");
      router.replace(url.pathname + (url.search || ""), { scroll: false });
    } catch {
      /* ignore */
    }
  };

  const visibleNotes = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const filtered = keyword
      ? notes.filter((n) => {
          if (n.title.toLowerCase().includes(keyword)) return true;
          return contentToPlainText(n.content, n.contentType ?? null)
            .toLowerCase()
            .includes(keyword);
        })
      : notes;
    // 고정 → 최근 수정순 (서버 orderBy와 동일, 낙관적 갱신 후에도 유지)
    return [...filtered].sort((a, b) => {
      const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
      if (pinDiff !== 0) return pinDiff;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [notes, search]);

  const openNote = openNoteId ? notes.find((n) => n.id === openNoteId) ?? null : null;

  useEffect(() => {
    (async () => {
      try {
        const me = await fetchJson<{ role?: string }>("/api/profile/me");
        const r = me?.role;
        setCanConvertProject(r === "EXECUTIVE" || r === "ADMIN");
      } catch {
        setCanConvertProject(false);
      }
    })();
  }, []);

  const openImport = async () => {
    setImportOpen(true);
    setImportLoading(true);
    try {
      const list = await fetchNotesList("/api/user-notes?unlinked=1");
      setUnlinked(list);
    } catch {
      toast.error("메모 목록을 불러오지 못했습니다.");
      setUnlinked([]);
    } finally {
      setImportLoading(false);
    }
  };

  const handleAdd = async () => {
    try {
      const res = await fetch("/api/user-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "",
          content: "",
          projectId: projectId ?? null,
        }),
      });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof (raw as { error?: string }).error === "string" ? (raw as { error: string }).error : "요청 실패");
      }
      const created = unwrapNotePayload(raw);
      await mutate((prev) => [created, ...(prev ?? [])], { revalidate: false });
      // 만들자마자 바로 쓸 수 있게 편집 창을 띄운다
      setOpenNoteId(created.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "메모를 추가하지 못했습니다.");
    }
  };

  const handlePatch = async (
    id: string,
    body: {
      title?: string;
      content?: string;
      contentType?: "text" | "html";
      category?: string;
      attachments?: { url: string; name: string }[];
      colorHex?: string;
      pinned?: boolean;
    }
  ) => {
    const updated = await fetchJson<UserNoteDto>(`/api/user-notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await mutate(
      (prev) => (prev ?? []).map((n) => (n.id === id ? { ...n, ...updated } : n)),
      { revalidate: false }
    );
    return updated;
  };

  const handleColorChange = async (id: string, colorHex: string) => {
    try {
      await handlePatch(id, { colorHex });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "색상을 바꾸지 못했습니다.");
    }
  };

  const handleTogglePin = async (id: string, pinned: boolean) => {
    try {
      await handlePatch(id, { pinned });
      toast.success(pinned ? "맨 위에 고정했습니다." : "고정을 해제했습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "고정을 바꾸지 못했습니다.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 메모를 삭제할까요?")) return;
    try {
      await fetchJson<{ ok: boolean }>(`/api/user-notes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setOpenNoteId((prev) => (prev === id ? null : prev));
      await mutate(
        (prev) => (prev ?? []).filter((n) => n.id !== id),
        { revalidate: false }
      );
      toast.success("삭제했습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제하지 못했습니다.");
    }
  };

  const linkToProject = async (noteId: string) => {
    if (!projectId) return;
    setLinkingId(noteId);
    try {
      await fetch("/api/user-notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: noteId, projectId }),
      }).then(async (res) => {
        const raw = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(typeof (raw as { error?: string }).error === "string" ? (raw as { error: string }).error : "요청 실패");
        }
        return unwrapNotePayload(raw);
      });
      toast.success("메모를 이 프로젝트에 연결했습니다.");
      setImportOpen(false);
      await mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "연결하지 못했습니다.");
    } finally {
      setLinkingId(null);
    }
  };

  const openConvert = async (note: UserNoteDto) => {
    setConvertNote(note);
    setBrandId("");
    try {
      const list = await fetchJson<BrandOption[]>("/api/brands");
      const arr = Array.isArray(list) ? list : [];
      setBrands(arr);
      if (arr.length === 1) setBrandId(arr[0].id);
    } catch {
      setBrands([]);
      toast.error("브랜드 목록을 불러오지 못했습니다.");
    }
  };

  const submitConvert = async () => {
    if (!convertNote || !brandId) {
      toast.error("브랜드를 선택하세요.");
      return;
    }
    setConverting(true);
    try {
      const project = await fetchJson<{ id: string; name: string }>(
        `/api/user-notes/${convertNote.id}/convert-to-project`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId }),
        }
      );
      toast.success("프로젝트를 만들었습니다.");
      setConvertNote(null);
      await mutate();
      router.push(`/projects/${project.id}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "변환하지 못했습니다.");
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{heading ?? "메모장"}</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {description ??
              (projectId
                ? "이 프로젝트에만 연결되는 메모입니다. 카드를 누르면 편집창이 열립니다."
                : "카드를 누르면 편집창이 열리고, 입력은 자동 저장됩니다.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-[220px]">
            <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="제목·내용 검색"
              className="h-9 pl-8 pr-8"
            />
            {search && (
              <button
                type="button"
                aria-label="검색어 지우기"
                onClick={() => setSearch("")}
                className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <Button type="button" size="sm" onClick={() => void handleAdd()}>
            <Plus className="mr-1.5 size-4" />
            추가
          </Button>
          {projectId ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => void openImport()}>
              <Inbox className="mr-1.5 size-4" />
              가져오기
            </Button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">불러오는 중…</p>
      ) : visibleNotes.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">
          {search.trim() ? (
            `“${search.trim()}”에 해당하는 메모가 없습니다.`
          ) : (
            <span className="inline-flex flex-col items-center gap-2">
              <StickyNote className="size-6 opacity-50" />
              메모가 없습니다. 「추가」를 눌러 첫 메모를 만드세요.
            </span>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleNotes.map((n) => (
            <UserNoteTile
              key={n.id}
              note={n}
              showProjectLink={!projectId}
              showConvertToProject={canConvertProject}
              onOpen={setOpenNoteId}
              onColorChange={(id, colorHex) => void handleColorChange(id, colorHex)}
              onTogglePin={(id, pinned) => void handleTogglePin(id, pinned)}
              onDelete={(id) => void handleDelete(id)}
              onRequestConvert={openConvert}
            />
          ))}
        </div>
      )}

      <Dialog
        open={!!openNote}
        onOpenChange={(o) => {
          if (!o) {
            setOpenNoteId(null);
            clearNoteQuery();
          }
        }}
      >
        <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden p-4 sm:max-w-3xl">
          <DialogHeader className="pb-1">
            <DialogTitle className="text-sm">메모 편집</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {openNote ? (
              <UserNoteCard
                key={openNote.id}
                note={openNote}
                showProjectLink={!projectId}
                showConvertToProject={canConvertProject}
                onPatch={handlePatch}
                onDelete={async (id) => {
                  await handleDelete(id);
                }}
                onRequestConvert={(n) => {
                  setOpenNoteId(null);
                  openConvert(n);
                }}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>메모장에서 가져오기</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            프로젝트에 아직 연결되지 않은 메모입니다. 선택하면 이 프로젝트에 연결됩니다.
          </p>
          {importLoading ? (
            <p className="text-sm text-muted-foreground">불러오는 중…</p>
          ) : unlinked.length === 0 ? (
            <p className="text-sm text-muted-foreground">가져올 수 있는 메모가 없습니다.</p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {unlinked.map((u) => {
                const preview =
                  u.title.trim() ||
                  plainTextFromHtml(u.content).slice(0, 60) ||
                  "(제목 없음)";
                return (
                  <li key={u.id}>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto w-full justify-start whitespace-normal py-2 text-left font-normal"
                      disabled={linkingId === u.id}
                      onClick={() => void linkToProject(u.id)}
                    >
                      {linkingId === u.id ? "연결 중…" : preview}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!convertNote} onOpenChange={(o) => !o && setConvertNote(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>프로젝트로 만들기</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            메모 제목(또는 본문 앞부분)으로 CRM 프로젝트가 만들어지고, 이 메모는 해당 프로젝트에 연결됩니다.
          </p>
          <Select value={brandId || undefined} onValueChange={setBrandId}>
            <SelectTrigger>
              <SelectValue placeholder="브랜드 선택" />
            </SelectTrigger>
            <SelectContent>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setConvertNote(null)}>
              취소
            </Button>
            <Button type="button" disabled={converting || !brandId} onClick={() => void submitConvert()}>
              {converting ? "처리 중…" : "프로젝트 생성"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!projectId ? (
        <p className="text-xs text-muted-foreground">
          CRM 프로젝트와 함께 보려면{" "}
          <Link href="/quotations" className="underline underline-offset-2">
            견적/프로젝트
          </Link>
          에서 프로젝트 상세의 메모 영역을 이용하세요.
        </p>
      ) : null}
    </div>
  );
}
