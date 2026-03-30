"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Plus, Inbox } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import type { UserNoteDto } from "./types";
import { plainTextFromHtml } from "@/lib/sanitize-note-html";

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
};

export function UserNotesBoard({ projectId, heading, description }: Props) {
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
      toast.success(projectId ? "프로젝트에 메모가 추가되었습니다." : "새 메모를 작성하세요.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "메모를 추가하지 못했습니다.");
    }
  };

  const handlePatch = async (
    id: string,
    body: { title?: string; content?: string; contentType?: "text" | "html" }
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

  const handleDelete = async (id: string) => {
    try {
      await fetchJson<{ ok: boolean }>(`/api/user-notes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{heading ?? "메모장"}</h2>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              {projectId
                ? "이 프로젝트에만 연결되는 메모입니다. 게시판 글쓰기와 동일하게 텍스트(BlockNote, 슬래시 메뉴의 HTML 블록)와 HTML 전체 페이지 탭·미리보기로 작성하며 자동 저장됩니다."
                : "구글 Keep 스타일 메모입니다. 게시판과 동일한 본문 편집기로 텍스트·HTML·미리보기 탭을 사용할 수 있습니다."}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => void handleAdd()}>
            <Plus className="mr-2 size-4" />
            + 추가
          </Button>
          {projectId ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => void openImport()}>
              <Inbox className="mr-2 size-4" />
              메모장에서 가져오기
            </Button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          메모가 없습니다. 위에서 「+ 추가」로 새 메모를 만드세요.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {notes.map((n) => (
            <UserNoteCard
              key={n.id}
              note={n}
              showProjectLink={!projectId}
              showConvertToProject={canConvertProject}
              onPatch={handlePatch}
              onDelete={handleDelete}
              onRequestConvert={openConvert}
            />
          ))}
        </div>
      )}

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
