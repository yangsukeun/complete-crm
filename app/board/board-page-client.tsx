"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import useSWR from "swr";
import { jsonFetcher, SWR_KEYS } from "@/lib/api-swr";
import Link from "next/link";
import { AuthorMetaLine } from "@/components/author-meta-line";
import dynamic from "next/dynamic";
import {
  FolderOpen,
  Plus,
  Loader2,
  Trash2,
  FileText,
  GraduationCap,
  Building2,
  Megaphone,
  MessageSquare,
  Ghost,
  ClipboardList,
  LayoutGrid,
  Rows3,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { previewPlainTextForBoard } from "@/lib/board-body";
import { getPreviewMediaFromAttachmentsClient } from "@/lib/board-list-preview";
import { toast } from "sonner";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
/** BlockNote 기반 에디터는 SSR·하이드레이션 시 Suspense(#419) 이슈가 있어 클라이언트에서만 로드 */
const ContentBodyEditor = dynamic(
  () =>
    import("@/components/content-body-editor").then((m) => ({ default: m.ContentBodyEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[200px] items-center justify-center rounded-md border bg-muted/30 text-sm text-muted-foreground">
        본문 편집기를 불러오는 중…
      </div>
    ),
  }
);
import { Skeleton } from "@/components/ui/skeleton";
import Image from "next/image";
import { getDriveThumbnailUrl } from "@/lib/google-drive-url";
import { isUnoptimizedRemoteImageSrc } from "@/lib/remote-image-unoptimized";
import { isPlainLeftClick } from "@/lib/peek-navigation";
import { BoardPostPeekSheet } from "@/components/board-post-peek-sheet";
import { markBoardLastSeenNow } from "@/lib/board-last-seen";
import type { ContentBodyEditorHandle } from "@/components/content-body-editor";

const CATEGORY_LABEL: Record<string, string> = {
  COMPANY: "회사 자료",
  TRAINING: "교육자료",
  FREE: "자유게시판",
  ANONYMOUS: "익명게시판",
  MEETING: "회의록",
};

/** 한 줄 목록에서 구분을 색으로 훑을 수 있게 */
const CATEGORY_BADGE: Record<string, string> = {
  COMPANY: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  TRAINING: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  FREE: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  ANONYMOUS: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  MEETING: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
};

const CATEGORY_ICON: Record<string, typeof FolderOpen> = {
  TRAINING: GraduationCap,
  FREE: MessageSquare,
  ANONYMOUS: Ghost,
  MEETING: ClipboardList,
};

const BOARD_VIEW_MODE_KEY = "board-view-mode-v1";
type BoardViewMode = "list" | "gallery";
type BoardSort = "recent" | "title";

/** 상단 구분 탭 — 전체 + 공지 + 게시판 카테고리 */
const FILTER_TABS: { value: string; label: string; icon: typeof FolderOpen }[] = [
  { value: "", label: "전체", icon: FolderOpen },
  { value: "ANNOUNCEMENT", label: "공지사항", icon: Megaphone },
  { value: "COMPANY", label: "회사 자료", icon: Building2 },
  { value: "TRAINING", label: "교육자료", icon: GraduationCap },
  { value: "FREE", label: "자유게시판", icon: MessageSquare },
  { value: "ANONYMOUS", label: "익명게시판", icon: Ghost },
  { value: "MEETING", label: "회의록", icon: ClipboardList },
];

type AttachmentItem = { url: string; name: string };

type AnnouncementItem = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  createdByName: string;
  createdByPosition: string | null;
};

type BoardListPreviewPayload = {
  text: string;
  mediaType: "image" | "video" | null;
  imageUrl: string | null;
  videoUrl: string | null;
};

type BoardItem = {
  id: string;
  title: string;
  /** 레거시/폴백 — 목록 API는 listPreview 우선 */
  description?: string;
  category: string;
  workspaceScope?: "TEAM" | "PERSONAL";
  attachments: AttachmentItem[];
  listPreview?: BoardListPreviewPayload;
  createdAt: string;
  createdById?: string;
  createdByName: string;
  createdByPosition: string | null;
  lastEditedByName?: string | null;
  updatedAt?: string;
  isAuthorSelf?: boolean;
};

type UnifiedItem =
  | { type: "ANNOUNCEMENT"; data: AnnouncementItem }
  | { type: "BOARD"; data: BoardItem };

function stripMarkdownPreview(text: string, maxLen: number): string {
  const stripped = text
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`[^`]+`/g, "")
    .replace(/\n/g, " ")
    .trim();
  return stripped.length > maxLen ? stripped.slice(0, maxLen) + "…" : stripped;
}

type BoardMedia = { type: "image" | "video"; url: string; name: string } | null;

function resolveBoardPreview(b: BoardItem): { preview: string; media: BoardMedia } {
  const preview =
    b.listPreview?.text?.trim() ??
    (b.description != null && b.description !== ""
      ? previewPlainTextForBoard(b.description, 72)
      : "");
  const media: BoardMedia =
    b.listPreview?.mediaType === "image" && b.listPreview.imageUrl
      ? { type: "image", url: b.listPreview.imageUrl, name: b.title }
      : b.listPreview?.mediaType === "video" && b.listPreview.videoUrl
        ? { type: "video", url: b.listPreview.videoUrl, name: b.title }
        : getPreviewMediaFromAttachmentsClient(b.attachments, b.description);
  return { preview, media };
}

/**
 * 목록형 한 줄. 썸네일은 40px로 작게 두고, 올려 두면 큰 미리보기를 띄운다.
 * (마우스가 없는 환경에서는 행을 눌러 미리보기 시트를 연다)
 */
function BoardListRow({
  item,
  canDelete,
  deleting,
  onPeek,
  onDelete,
}: {
  item: BoardItem;
  canDelete: boolean;
  deleting: boolean;
  onPeek: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { preview, media } = resolveBoardPreview(item);
  const Icon = CATEGORY_ICON[item.category] ?? FolderOpen;
  const thumbSrc = media?.type === "image" ? getDriveThumbnailUrl(media.url, 160) : "";
  const largeSrc = media?.type === "image" ? getDriveThumbnailUrl(media.url, 900) : "";

  const thumb = (
    <span className="bg-muted relative size-10 shrink-0 overflow-hidden rounded-md">
      {media?.type === "image" ? (
        <Image
          src={thumbSrc}
          alt={item.title}
          fill
          sizes="80px"
          unoptimized={isUnoptimizedRemoteImageSrc(thumbSrc)}
          loading="lazy"
          className="object-cover"
        />
      ) : media?.type === "video" ? (
        <video src={media.url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
      ) : (
        <span className="text-muted-foreground flex h-full w-full items-center justify-center">
          <Icon className="size-4 opacity-60" />
        </span>
      )}
    </span>
  );

  return (
    <li>
      <Link
        href={`/board/${item.id}`}
        prefetch={false}
        className="hover:bg-muted/50 flex items-center gap-3 px-3 py-2 outline-none transition-colors"
        onClick={(e) => {
          if (!isPlainLeftClick(e)) return;
          e.preventDefault();
          onPeek(item.id);
        }}
      >
        {media ? (
          <HoverCard openDelay={120} closeDelay={60}>
            <HoverCardTrigger asChild>{thumb}</HoverCardTrigger>
            <HoverCardContent side="right" align="start" className="w-72 p-1.5">
              <div className="bg-muted relative aspect-[4/3] w-full overflow-hidden rounded">
                {media.type === "image" ? (
                  <Image
                    src={largeSrc}
                    alt={item.title}
                    fill
                    sizes="288px"
                    unoptimized={isUnoptimizedRemoteImageSrc(largeSrc)}
                    className="object-contain"
                  />
                ) : (
                  <video
                    src={media.url}
                    className="h-full w-full object-contain"
                    muted
                    playsInline
                    loop
                    autoPlay
                    preload="metadata"
                  />
                )}
              </div>
              {preview && (
                <p className="text-muted-foreground mt-1.5 line-clamp-3 px-0.5 text-xs">{preview}</p>
              )}
            </HoverCardContent>
          </HoverCard>
        ) : (
          thumb
        )}

        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
            CATEGORY_BADGE[item.category] ?? "bg-muted text-muted-foreground"
          )}
        >
          {CATEGORY_LABEL[item.category] ?? item.category}
        </span>
        {item.workspaceScope === "PERSONAL" && (
          <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
            개인
          </span>
        )}

        <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>

        {preview && (
          <span className="text-muted-foreground hidden max-w-[28%] shrink truncate text-xs xl:block">
            {preview}
          </span>
        )}
        {item.attachments.length > 0 && (
          <span className="text-muted-foreground hidden shrink-0 items-center gap-0.5 text-[11px] sm:flex">
            <FileText className="size-3" />
            {item.attachments.length}
          </span>
        )}
        <span className="text-muted-foreground hidden w-20 shrink-0 truncate text-right text-xs sm:block">
          {item.createdByName}
        </span>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {format(new Date(item.createdAt), "yy.MM.dd", { locale: ko })}
        </span>
        {canDelete ? (
          <span onClick={(e) => e.preventDefault()} className="inline-flex shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive size-7"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(item.id);
              }}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </Button>
          </span>
        ) : (
          <span className="size-7 shrink-0" />
        )}
      </Link>
    </li>
  );
}

function AnnouncementListRow({ item }: { item: AnnouncementItem }) {
  return (
    <li>
      <Link
        href={`/announcements/${item.id}`}
        prefetch={false}
        className="hover:bg-muted/50 flex items-center gap-3 px-3 py-2 outline-none transition-colors"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
          <Megaphone className="size-4" />
        </span>
        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          공지
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
        <span className="text-muted-foreground hidden max-w-[28%] shrink truncate text-xs xl:block">
          {stripMarkdownPreview(item.content, 80)}
        </span>
        <span className="text-muted-foreground hidden w-20 shrink-0 truncate text-right text-xs sm:block">
          {item.createdByName}
        </span>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {format(new Date(item.createdAt), "yy.MM.dd", { locale: ko })}
        </span>
        <span className="size-7 shrink-0" />
      </Link>
    </li>
  );
}

export function BoardPageClient({
  canCreate,
  canCreateAnnouncement,
  currentUserId,
  currentUserRole,
}: {
  canCreate: boolean;
  canCreateAnnouncement: boolean;
  currentUserId?: string;
  currentUserRole?: string;
}) {
  const {
    data: swrAnnouncements = [],
    mutate: mutateAnnouncements,
    isLoading: announcementsLoading,
  } = useSWR<AnnouncementItem[]>(SWR_KEYS.announcements, jsonFetcher, {
    dedupingInterval: 15_000,
    revalidateOnFocus: false,
  });
  const announcements = swrAnnouncements;
  const [boardList, setBoardList] = useState<BoardItem[]>([]);
  const [boardHasMore, setBoardHasMore] = useState(false);
  const [boardNextOffset, setBoardNextOffset] = useState(0);
  const [boardLoadingMore, setBoardLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  /** 입력마다 조회하지 않도록 지연 적용 */
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<BoardSort>("recent");
  const [openAnnouncement, setOpenAnnouncement] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [bodyContent, setBodyContent] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [peekBoardId, setPeekBoardId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<BoardViewMode>("list");
  const announcementEditorRef = useRef<ContentBodyEditorHandle | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(BOARD_VIEW_MODE_KEY);
      if (raw === "list" || raw === "gallery") setViewMode(raw);
    } catch {
      /* ignore */
    }
  }, []);

  const changeViewMode = (mode: BoardViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(BOARD_VIEW_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  };

  const BOARD_PAGE = 20;

  const boardCategoryQuery = (f: string) =>
    f === "COMPANY" || f === "TRAINING" || f === "FREE" || f === "ANONYMOUS" || f === "MEETING"
      ? f
      : undefined;

  const fetchBoardPage = async (offset: number, category?: string) => {
    const params = new URLSearchParams({
      limit: String(BOARD_PAGE),
      offset: String(offset),
    });
    if (category) params.set("category", category);
    if (search.trim()) params.set("q", search.trim());
    if (sort === "title") params.set("sort", "title");
    const boardRes = await fetch(`/api/board?${params}`, { credentials: "include" });
    if (!boardRes.ok) return { items: [] as BoardItem[], hasMore: false, nextOffset: offset };
    const raw = await boardRes.json();
    const items = raw.items ?? [];
    const hasMore = Boolean(raw.hasMore);
    const nextOffset = (raw.offset ?? offset) + items.length;
    return { items, hasMore, nextOffset };
  };

  const refreshBoard = async () => {
    setLoading(true);
    setBoardLoadingMore(false);
    try {
      if (filter === "ANNOUNCEMENT") {
        setBoardList([]);
        setBoardHasMore(false);
        setBoardNextOffset(0);
        return;
      }

      const cat = boardCategoryQuery(filter);
      const { items, hasMore, nextOffset } = await fetchBoardPage(0, cat);
      setBoardList(items);
      setBoardHasMore(hasMore);
      setBoardNextOffset(nextOffset);
    } catch {
      setBoardList([]);
      setBoardHasMore(false);
      setBoardNextOffset(0);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 게시판 자료: API 응답만 스켈레톤 게이트.
   * 공지 전용 탭은 공지 SWR 첫 로드까지 스켈레톤 유지.
   */
  const pageLoading = useMemo(
    () =>
      loading ||
      (filter === "ANNOUNCEMENT" && announcementsLoading && announcements.length === 0),
    [loading, filter, announcementsLoading, announcements.length]
  );

  useEffect(() => {
    if (pageLoading) return;
    markBoardLastSeenNow();
  }, [pageLoading]);

  const loadMoreBoard = async () => {
    if (!boardHasMore || boardLoadingMore || filter === "ANNOUNCEMENT") return;
    setBoardLoadingMore(true);
    try {
      const cat = boardCategoryQuery(filter);
      const { items, hasMore, nextOffset } = await fetchBoardPage(boardNextOffset, cat);
      setBoardList((prev) => [...prev, ...items]);
      setBoardHasMore(hasMore);
      setBoardNextOffset(nextOffset);
    } catch {
      toast.error("자료를 더 불러오지 못했습니다.");
    } finally {
      setBoardLoadingMore(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    void refreshBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 조건 바뀔 때 게시판 페이지만 초기화 (공지는 SWR 공유)
  }, [filter, search, sort]);

  const unifiedList: UnifiedItem[] = (() => {
    const keyword = search.trim().toLowerCase();
    /** 공지는 SWR로 전체를 들고 있어 검색·정렬을 클라이언트에서 맞춘다 */
    const visibleAnnouncements = keyword
      ? announcements.filter((a) => a.title.toLowerCase().includes(keyword))
      : announcements;
    const ann: UnifiedItem[] = visibleAnnouncements.map((a: any) => ({
      type: "ANNOUNCEMENT",
      data: a,
    }));
    const board: UnifiedItem[] = boardList.map((b: any) => ({ type: "BOARD", data: b }));
    const merged = [...ann, ...board];
    merged.sort((a, b) => {
      if (sort === "title") return a.data.title.localeCompare(b.data.title, "ko");
      const tA = a.type === "ANNOUNCEMENT" ? a.data.createdAt : a.data.createdAt;
      const tB = b.type === "ANNOUNCEMENT" ? b.data.createdAt : b.data.createdAt;
      return new Date(tB).getTime() - new Date(tA).getTime();
    });
    if (filter === "ANNOUNCEMENT") return merged.filter((x: any) => x.type === "ANNOUNCEMENT");
    if (
      filter === "COMPANY" ||
      filter === "TRAINING" ||
      filter === "FREE" ||
      filter === "ANONYMOUS" ||
      filter === "MEETING"
    )
      return merged.filter((x: any) => x.type === "BOARD" && x.data.category === filter);
    return merged;
  })();

  const newBoardHref =
    filter === "COMPANY" ||
    filter === "TRAINING" ||
    filter === "FREE" ||
    filter === "ANONYMOUS" ||
    filter === "MEETING"
      ? `/board/new?category=${encodeURIComponent(filter)}`
      : "/board/new";

  const handleSubmitAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    const flushedBody = announcementEditorRef.current?.flushPendingChange() ?? bodyContent;
    if (!title.trim() || !flushedBody.trim()) {
      toast.error("제목과 내용을 입력하세요.");
      return;
    }
    setSubmitLoading(true);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: flushedBody.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "등록 실패");
      toast.success("공지사항이 등록되었습니다.");
      setTitle("");
      setBodyContent("");
      setOpenAnnouncement(false);
      void mutateAnnouncements();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "공지 등록에 실패했습니다.");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteBoard = async (id: string) => {
    if (!confirm("이 자료를 삭제(숨김)할까요? 관리자는 휴지통에서 복원하거나 영구 삭제할 수 있습니다.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/board/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "삭제 실패");
      toast.success("삭제되었습니다.");
      void refreshBoard();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  const resetAnnouncementForm = () => {
    setTitle("");
    setBodyContent("");
    setOpenAnnouncement(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="bg-muted/50 flex flex-wrap items-center gap-0.5 rounded-lg border p-0.5"
          role="tablist"
          aria-label="자료 구분"
        >
          {FILTER_TABS.map(({ value, label, icon: Icon }) => (
            <button
              key={value || "all"}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                filter === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {canCreateAnnouncement && (
            <Button
              variant="outline"
              onClick={() => {
                setTitle("");
                setBodyContent("");
                setOpenAnnouncement(true);
              }}
              className="gap-1"
            >
              <Megaphone className="size-4" />
              공지 등록
            </Button>
          )}
          {canCreate && (
            <Button asChild className="gap-1">
              <Link href={newBoardHref}>
                <Plus className="size-4" />
                자료 올리기
              </Link>
            </Button>
          )}
        </div>
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <FolderOpen className="size-5" />
            공지·자료 목록
          </h2>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <div className="relative w-full max-w-[240px]">
              <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="제목 검색"
                className="h-9 pl-8 pr-8"
              />
              {searchInput && (
                <button
                  type="button"
                  aria-label="검색어 지우기"
                  onClick={() => setSearchInput("")}
                  className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as BoardSort)}>
              <SelectTrigger className="h-9 w-[110px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="recent">최신순</SelectItem>
                <SelectItem value="title">제목순</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center rounded-md border" role="group" aria-label="목록 표시 방식">
            <button
              type="button"
              title="목록형 — 제목 위주로 훑기"
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
              title="갤러리형 — 이미지 크게 보기"
              aria-pressed={viewMode === "gallery"}
              onClick={() => changeViewMode("gallery")}
              className={cn(
                "text-muted-foreground hover:bg-muted/80 rounded-r-md border-l p-1.5 transition-colors",
                viewMode === "gallery" && "bg-muted text-foreground"
              )}
            >
              <LayoutGrid className="size-4" />
            </button>
            </div>
          </div>
        </div>
        {pageLoading ? (
          viewMode === "list" ? (
            <ul className="bg-card divide-y overflow-hidden rounded-xl border">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-2">
                  <Skeleton className="size-10 shrink-0 rounded-md" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-3 w-16 shrink-0" />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <li key={i} className="overflow-hidden rounded-lg border bg-card shadow-sm">
                  <Skeleton className="aspect-[5/4] w-full rounded-none" />
                  <div className="space-y-1.5 p-2.5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : unifiedList.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/30 py-12 text-center text-muted-foreground">
            {search.trim()
              ? `“${search.trim()}”에 해당하는 제목이 없습니다.`
              : filter === "ANNOUNCEMENT"
                ? "등록된 공지사항이 없습니다."
                : filter
                  ? "해당 구분의 자료가 없습니다."
                  : "등록된 공지·자료가 없습니다."}
          </div>
        ) : viewMode === "list" ? (
          <ul className="bg-card divide-y overflow-hidden rounded-xl border">
            {unifiedList.map((item) =>
              item.type === "ANNOUNCEMENT" ? (
                <AnnouncementListRow key={`ann-${item.data.id}`} item={item.data} />
              ) : (
                <BoardListRow
                  key={`board-${item.data.id}`}
                  item={item.data}
                  canDelete={canCreate && (!currentUserId || Boolean(item.data.isAuthorSelf))}
                  deleting={deletingId === item.data.id}
                  onPeek={setPeekBoardId}
                  onDelete={(id) => void handleDeleteBoard(id)}
                />
              )
            )}
          </ul>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {(() => {
              let boardCardImageIndex = 0;
              return unifiedList.map((item: any) => {
              if (item.type === "ANNOUNCEMENT") {
                const a = item.data;
                const preview = stripMarkdownPreview(a.content, 80);
                return (
                  <li
                    key={`ann-${a.id}`}
                    className="col-span-2 rounded-lg border bg-card shadow-sm transition-colors hover:bg-muted/50 sm:col-span-3 md:col-span-4 lg:col-span-5"
                  >
                    <Link
                      href={`/announcements/${a.id}`}
                      prefetch={false}
                      className="block p-3 outline-none sm:p-3.5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium leading-snug">{a.title}</span>
                          <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                            <Megaphone className="size-3" />
                            공지
                          </span>
                        </div>
                        <span className="text-muted-foreground shrink-0 text-xs">
                          {format(new Date(a.createdAt), "yyyy.MM.dd HH:mm", { locale: ko })}
                        </span>
                      </div>
                      {preview && (
                        <p className="text-muted-foreground mt-1 line-clamp-1 break-words text-xs">
                          {preview}
                        </p>
                      )}
                      <p className="text-muted-foreground mt-1.5 text-[11px]">
                        {a.createdByName}
                        {a.createdByPosition ? ` · ${a.createdByPosition}` : ""}
                      </p>
                    </Link>
                  </li>
                );
              }
              const b = item.data;
              const preview =
                b.listPreview?.text?.trim() ??
                (b.description != null && b.description !== ""
                  ? previewPlainTextForBoard(b.description, 72)
                  : "");
              const media =
                b.listPreview?.mediaType === "image" && b.listPreview.imageUrl
                  ? { type: "image" as const, url: b.listPreview.imageUrl, name: b.title }
                  : b.listPreview?.mediaType === "video" && b.listPreview.videoUrl
                    ? { type: "video" as const, url: b.listPreview.videoUrl, name: b.title }
                    : getPreviewMediaFromAttachmentsClient(b.attachments, b.description);
              const boardThumbRank = media?.type === "image" ? boardCardImageIndex++ : -1;
              const thumbEager = boardThumbRank >= 0 && boardThumbRank < 5;
              const imageSrc =
                media?.type === "image" ? getDriveThumbnailUrl(media.url, 400) : "";
              return (
                <li
                  key={`board-${b.id}`}
                  className="overflow-hidden rounded-lg border bg-card shadow-sm transition-all hover:shadow-md"
                >
                  <Link
                    href={`/board/${b.id}`}
                    prefetch={false}
                    className="block outline-none"
                    onClick={(e) => {
                      if (!isPlainLeftClick(e)) return;
                      e.preventDefault();
                      setPeekBoardId(b.id);
                    }}
                  >
                    {/* 이미지/영상 미리보기 또는 플레이스홀더 */}
                    <div className="relative aspect-[5/4] w-full bg-muted">
                      {media?.type === "image" ? (
                        <Image
                          src={imageSrc}
                          alt={media.name || b.title}
                          fill
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
                          unoptimized={isUnoptimizedRemoteImageSrc(imageSrc)}
                          loading={thumbEager ? "eager" : "lazy"}
                          priority={thumbEager}
                          fetchPriority={thumbEager ? "high" : undefined}
                          className="object-cover"
                        />
                      ) : media?.type === "video" ? (
                        <video
                          src={media.url}
                          className="h-full w-full object-cover"
                          muted
                          playsInline
                          loop
                          preload="metadata"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          {b.category === "TRAINING" ? (
                            <GraduationCap className="size-8 opacity-50 sm:size-9" />
                          ) : b.category === "FREE" ? (
                            <MessageSquare className="size-8 opacity-50 sm:size-9" />
                          ) : b.category === "ANONYMOUS" ? (
                            <Ghost className="size-8 opacity-50 sm:size-9" />
                          ) : b.category === "MEETING" ? (
                            <ClipboardList className="size-8 opacity-50 sm:size-9" />
                          ) : (
                            <FolderOpen className="size-8 opacity-50 sm:size-9" />
                          )}
                        </div>
                      )}
                      <div className="absolute right-1 top-1 flex flex-col items-end gap-0.5">
                        <span className="rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
                          {CATEGORY_LABEL[b.category] ?? b.category}
                        </span>
                        {b.workspaceScope === "PERSONAL" && (
                          <span className="rounded bg-violet-600/90 px-1.5 py-0.5 text-[10px] text-white">
                            개인
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="p-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-1.5">
                        <h3 className="min-w-0 flex-1 text-sm font-medium leading-snug">{b.title}</h3>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <span className="text-muted-foreground text-[10px] sm:text-xs">
                            {format(new Date(b.createdAt), "yyyy.MM.dd HH:mm", { locale: ko })}
                          </span>
                          {(canCreate && (!currentUserId || b.isAuthorSelf)) && (
                            <span onClick={(e) => e.preventDefault()} className="inline-flex">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive h-7 w-7"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDeleteBoard(b.id);
                                }}
                                disabled={deletingId === b.id}
                              >
                                {deletingId === b.id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Trash2 className="size-4" />
                                )}
                              </Button>
                            </span>
                          )}
                        </div>
                      </div>
                      {preview && (
                        <p className="text-muted-foreground mt-1 line-clamp-1 break-words text-xs">
                          {preview}
                        </p>
                      )}
                      {b.attachments.length > 0 && !media && (
                        <div className="mt-1.5 flex flex-wrap gap-0.5">
                          {b.attachments.slice(0, 3).map((att: any, idx: any) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-xs"
                              onClick={(e) => e.preventDefault()}
                            >
                              <FileText className="size-3" />
                              {att.name?.slice(0, 8)}
                              {att.name?.length > 8 ? "…" : ""}
                            </span>
                          ))}
                          {b.attachments.length > 3 && (
                            <span className="text-muted-foreground text-xs">+{b.attachments.length - 3}</span>
                          )}
                        </div>
                      )}
                      <AuthorMetaLine
                        authorName={b.createdByName}
                        editorName={b.lastEditedByName}
                        dateIso={b.updatedAt ?? b.createdAt}
                        className="mt-1.5 block text-[11px]"
                      />
                    </div>
                  </Link>
                </li>
              );
            });
            })()}
          </ul>
        )}
        {!loading && filter !== "ANNOUNCEMENT" && boardHasMore && (
          <div className="mt-6 flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadMoreBoard()}
              disabled={boardLoadingMore}
              className="gap-2"
            >
              {boardLoadingMore && <Loader2 className="size-4 animate-spin" />}
              자료 더 불러오기
            </Button>
          </div>
        )}
      </section>

      {/* 공지 등록 다이얼로그 — 업무상세와 동일한 본문 에디터 */}
      <BoardPostPeekSheet
        postId={peekBoardId}
        onClose={() => setPeekBoardId(null)}
        onDeleted={() => void refreshBoard()}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
      />

      <Dialog open={openAnnouncement} onOpenChange={(o: any) => !o && resetAnnouncementForm()}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-6 gap-0">
          <DialogHeader>
            <DialogTitle>공지사항 등록</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitAnnouncement} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label htmlFor="announcement-title">제목</Label>
              <Input
                id="announcement-title"
                value={title}
                onChange={(e: any) => setTitle(e.target.value)}
                placeholder="공지 제목"
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label>내용 (프로젝트 상세와 동일한 서식)</Label>
              <ContentBodyEditor
                ref={announcementEditorRef}
                key={openAnnouncement ? "ann-open" : "ann-closed"}
                initialContent={bodyContent}
                onChange={setBodyContent}
                minHeight="320px"
                showHelp={true}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetAnnouncementForm}>
                취소
              </Button>
              <Button type="submit" disabled={submitLoading}>
                {submitLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
                등록
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
