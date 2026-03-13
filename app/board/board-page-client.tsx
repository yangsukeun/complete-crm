"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ContentBodyEditor } from "@/components/content-body-editor";
import { FilePreviewDialog } from "@/components/file-preview-dialog";

const CATEGORY_LABEL: Record<string, string> = {
  COMPANY: "회사 자료",
  TRAINING: "교육자료",
};

type AttachmentItem = { url: string; name: string };

type AnnouncementItem = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  createdByName: string;
  createdByPosition: string | null;
};

type BoardItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  attachments: AttachmentItem[];
  createdAt: string;
  createdByName: string;
  createdByPosition: string | null;
};

type UnifiedItem =
  | { type: "ANNOUNCEMENT"; data: AnnouncementItem }
  | { type: "BOARD"; data: BoardItem };

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|avif)(\?|$)/i;
const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i;

function getPreviewMedia(attachments: AttachmentItem[]): { type: "image" | "video"; url: string; name: string } | null {
  if (!attachments?.length) return null;
  const img = attachments.find((a) => IMAGE_EXT.test(a.url) || IMAGE_EXT.test(a.name));
  if (img) return { type: "image", url: img.url, name: img.name };
  const vid = attachments.find((a) => VIDEO_EXT.test(a.url) || VIDEO_EXT.test(a.name));
  if (vid) return { type: "video", url: vid.url, name: vid.name };
  return null;
}

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

export function BoardPageClient({
  canCreate,
  canCreateAnnouncement,
}: {
  canCreate: boolean;
  canCreateAnnouncement: boolean;
}) {
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [boardList, setBoardList] = useState<BoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [openBoard, setOpenBoard] = useState(false);
  const [openAnnouncement, setOpenAnnouncement] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [bodyContent, setBodyContent] = useState("");
  const [category, setCategory] = useState<"COMPANY" | "TRAINING">("COMPANY");
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [annRes, boardRes] = await Promise.all([
        fetch("/api/announcements"),
        fetch("/api/board"),
      ]);
      if (annRes.ok) {
        const data = await annRes.json();
        setAnnouncements(data);
      } else {
        setAnnouncements([]);
      }
      if (boardRes.ok) {
        const data = await boardRes.json();
        setBoardList(data);
      } else {
        setBoardList([]);
      }
    } catch {
      setAnnouncements([]);
      setBoardList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const unifiedList: UnifiedItem[] = (() => {
    const ann: UnifiedItem[] = announcements.map((a: any) => ({ type: "ANNOUNCEMENT", data: a }));
    const board: UnifiedItem[] = boardList.map((b: any) => ({ type: "BOARD", data: b }));
    const merged = [...ann, ...board];
    merged.sort((a, b) => {
      const tA = a.type === "ANNOUNCEMENT" ? a.data.createdAt : a.data.createdAt;
      const tB = b.type === "ANNOUNCEMENT" ? b.data.createdAt : b.data.createdAt;
      return new Date(tB).getTime() - new Date(tA).getTime();
    });
    if (filter === "ANNOUNCEMENT") return merged.filter((x: any) => x.type === "ANNOUNCEMENT");
    if (filter === "COMPANY" || filter === "TRAINING") return merged.filter((x: any) => x.type === "BOARD" && x.data.category === filter);
    return merged;
  })();

  const handleSubmitBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("제목을 입력하세요.");
      return;
    }
    setSubmitLoading(true);
    try {
      const res = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: bodyContent.trim() || "",
          category,
          attachments,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "등록 실패");
      toast.success("자료가 등록되었습니다.");
      setTitle("");
      setBodyContent("");
      setCategory("COMPANY");
      setAttachments([]);
      setOpenBoard(false);
      fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "자료 등록에 실패했습니다.");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleSubmitAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !bodyContent.trim()) {
      toast.error("제목과 내용을 입력하세요.");
      return;
    }
    setSubmitLoading(true);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: bodyContent.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "등록 실패");
      toast.success("공지사항이 등록되었습니다.");
      setTitle("");
      setBodyContent("");
      setOpenAnnouncement(false);
      fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "공지 등록에 실패했습니다.");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    if (attachments.length + files.length > 20) {
      toast.error("첨부파일은 최대 20개까지 가능합니다.");
      return;
    }
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "업로드 실패");
        setAttachments((prev: any) => [...prev, { url: data.url, name: data.name ?? file.name }]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "파일 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev: any) => prev.filter((_: any, i: any) => i !== index));
  };

  const handleDeleteBoard = async (id: string) => {
    if (!confirm("이 자료를 삭제하시겠습니까?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/board/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "삭제 실패");
      toast.success("삭제되었습니다.");
      fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  const resetBoardForm = () => {
    setTitle("");
    setBodyContent("");
    setCategory("COMPANY");
    setAttachments([]);
    setOpenBoard(false);
  };

  const resetAnnouncementForm = () => {
    setTitle("");
    setBodyContent("");
    setOpenAnnouncement(false);
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={filter === "" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("")}
          >
            전체
          </Button>
          <Button
            variant={filter === "ANNOUNCEMENT" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("ANNOUNCEMENT")}
            className="gap-1"
          >
            <Megaphone className="size-4" />
            공지사항
          </Button>
          <Button
            variant={filter === "COMPANY" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("COMPANY")}
            className="gap-1"
          >
            <Building2 className="size-4" />
            회사 자료
          </Button>
          <Button
            variant={filter === "TRAINING" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("TRAINING")}
            className="gap-1"
          >
            <GraduationCap className="size-4" />
            교육자료
          </Button>
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
            <Button
              onClick={() => {
                setTitle("");
                setBodyContent("");
                setCategory("COMPANY");
                setAttachments([]);
                setOpenBoard(true);
              }}
              className="gap-1"
            >
              <Plus className="size-4" />
              자료 올리기
            </Button>
          )}
        </div>
      </div>

      <section>
        <h2 className="mb-4 flex items-center gap-2 font-semibold">
          <FolderOpen className="size-5" />
          공지·자료 목록
        </h2>
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/30 py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span>불러오는 중...</span>
          </div>
        ) : unifiedList.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/30 py-12 text-center text-muted-foreground">
            {filter === "ANNOUNCEMENT"
              ? "등록된 공지사항이 없습니다."
              : filter
                ? "해당 구분의 자료가 없습니다."
                : "등록된 공지·자료가 없습니다."}
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {unifiedList.map((item: any) => {
              if (item.type === "ANNOUNCEMENT") {
                const a = item.data;
                const preview = stripMarkdownPreview(a.content, 120);
                return (
                  <li
                    key={`ann-${a.id}`}
                    className="sm:col-span-2 lg:col-span-3 rounded-xl border bg-card p-5 shadow-sm transition-colors hover:bg-muted/50"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">{a.title}</span>
                        <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                          <Megaphone className="size-3.5" />
                          공지
                        </span>
                      </div>
                      <span className="text-muted-foreground text-sm shrink-0">
                        {format(new Date(a.createdAt), "yyyy.MM.dd (EEE) HH:mm", { locale: ko })}
                      </span>
                    </div>
                    {preview && (
                      <p className="text-muted-foreground mt-1 line-clamp-2 break-words text-sm">
                        {preview}
                      </p>
                    )}
                    <p className="text-muted-foreground mt-2 text-xs">
                      {a.createdByName}
                      {a.createdByPosition ? ` · ${a.createdByPosition}` : ""}
                    </p>
                  </li>
                );
              }
              const b = item.data;
              const preview = stripMarkdownPreview(b.description, 120);
              const media = getPreviewMedia(b.attachments);
              return (
                <li
                  key={`board-${b.id}`}
                  className="overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:shadow-md"
                >
                  <Link href={`/board/${b.id}`} className="block outline-none">
                    {/* 이미지/영상 미리보기 또는 플레이스홀더 */}
                    <div className="relative aspect-video w-full bg-muted">
                      {media?.type === "image" ? (
                        <img
                          src={media.url}
                          alt={media.name || b.title}
                          className="h-full w-full object-cover"
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
                            <GraduationCap className="size-12 opacity-50" />
                          ) : (
                            <FolderOpen className="size-12 opacity-50" />
                          )}
                        </div>
                      )}
                      <span className="absolute right-2 top-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white">
                        {CATEGORY_LABEL[b.category] ?? b.category}
                      </span>
                    </div>
                    <div className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="min-w-0 flex-1 font-medium leading-tight">{b.title}</h3>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-muted-foreground text-xs">
                            {format(new Date(b.createdAt), "yyyy.MM.dd HH:mm", { locale: ko })}
                          </span>
                          {canCreate && (
                            <span onClick={(e) => e.preventDefault()} className="inline-flex">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive h-8 w-8"
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
                        <p className="text-muted-foreground mt-1 line-clamp-2 break-words text-sm">
                          {preview}
                        </p>
                      )}
                      {b.attachments.length > 0 && !media && (
                        <div className="mt-2 flex flex-wrap gap-1">
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
                      <p className="text-muted-foreground mt-2 text-xs">
                        {b.createdByName}
                        {b.createdByPosition ? ` · ${b.createdByPosition}` : ""}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 공지 등록 다이얼로그 — 업무상세와 동일한 본문 에디터 */}
      <Dialog open={openAnnouncement} onOpenChange={(o: any) => !o && resetAnnouncementForm()}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>공지사항 등록</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitAnnouncement} className="flex flex-col gap-4">
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
              <Label>내용 (업무 상세와 동일한 서식)</Label>
              <ContentBodyEditor
                key={openAnnouncement ? "ann-open" : "ann-closed"}
                initialContent={bodyContent}
                onChange={setBodyContent}
                minHeight="240px"
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

      {/* 자료 올리기 다이얼로그 — 업무상세와 동일한 본문 에디터 */}
      <Dialog open={openBoard} onOpenChange={(o: any) => !o && resetBoardForm()}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>자료 올리기</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitBoard} className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="board-title">제목</Label>
              <Input
                id="board-title"
                value={title}
                onChange={(e: any) => setTitle(e.target.value)}
                placeholder="제목을 입력하세요"
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="board-category">구분</Label>
              <select
                id="board-category"
                value={category}
                onChange={(e: any) => setCategory(e.target.value as "COMPANY" | "TRAINING")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="COMPANY">회사 자료</option>
                <option value="TRAINING">교육자료</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>설명 (업무 상세와 동일한 서식)</Label>
              <ContentBodyEditor
                key={openBoard ? "board-open" : "board-closed"}
                initialContent={bodyContent}
                onChange={setBodyContent}
                minHeight="240px"
                showHelp={true}
              />
            </div>
            <div className="space-y-2">
              <Label>첨부파일</Label>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,image/*,video/*,.mp4,.webm,.ogg,.mov,.txt"
                onChange={handleFileSelect}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || attachments.length >= 20}
                className="gap-1"
              >
                <FileText className="size-4" />
                {uploading ? "업로드 중..." : "파일 선택"}
              </Button>
              {attachments.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {attachments.map((att, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm">
                      <FilePreviewDialog
                        url={att.url}
                        name={att.name}
                        triggerVariant="ghost"
                        triggerClassName="h-7 px-2 justify-start text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => removeAttachment(idx)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetBoardForm}>
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
