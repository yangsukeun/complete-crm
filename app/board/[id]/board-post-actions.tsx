"use client";

import { useState, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HtmlEditorModeTabs, type HtmlEditorMode } from "@/components/html-editor-mode-tabs";

// [PERF-C] 게시글 수정 시에만 BlockNote 청크 로드
const ContentBodyEditor = dynamic(
  () =>
    import("@/components/content-body-editor").then((m) => m.ContentBodyEditor),
  {
    ssr: false,
    loading: () => (
      <div
        className="min-h-[360px] animate-pulse rounded-md border border-muted bg-muted/40"
        aria-hidden
      />
    ),
  }
);
import { FilePreviewDialog } from "@/components/file-preview-dialog";
import { FileText, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  summarizeSequentialUploadResults,
  uploadEachFileSequentially,
  UPLOAD_TOAST_DURATION_MS,
} from "@/lib/upload-client-validate";

type AttachmentItem = { url: string; name: string };

type BoardEditCategory = "COMPANY" | "TRAINING" | "FREE" | "ANONYMOUS" | "MEETING";

/** PATCH/DELETE가 HTML(에러 페이지·502 등)을 돌려줄 때 res.json() 대비 */
async function readBoardMutationJson(res: Response): Promise<{ error?: string; message?: string }> {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      return (await res.json()) as { error?: string; message?: string };
    } catch {
      throw new Error(
        `서버 응답을 해석할 수 없습니다 (${res.status}). 배포 직후이거나 일시 장애일 수 있습니다. 잠시 후 다시 시도해 주세요.`
      );
    }
  }
  const text = await res.text();
  const compact = text.replace(/\s+/g, " ").trimStart().slice(0, 120);
  const looksHtml = compact.startsWith("<") || /<!DOCTYPE/i.test(text);
  if (!res.ok && looksHtml) {
    throw new Error(
      `서버 오류 (${res.status}). 배포 중이거나 API가 HTML 오류 페이지를 반환했습니다. 잠시 후 다시 시도하거나 Vercel 로그를 확인해 주세요.`
    );
  }
  throw new Error(!res.ok ? `요청 실패 (${res.status}).` : "서버 응답 형식이 올바르지 않습니다.");
}

type Props = {
  postId: string;
  canEdit: boolean;
  initialTitle: string;
  initialDescription: string;
  initialContentType?: string;
  initialCategory: BoardEditCategory;
  initialAttachments: AttachmentItem[];
};

export function BoardPostActions({
  postId,
  canEdit,
  initialTitle,
  initialDescription,
  initialContentType = "text",
  initialCategory,
  initialAttachments,
}: Props) {
  const router = useRouter();

  const [editOpen, setEditOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [bodyContent, setBodyContent] = useState(initialDescription);
  const [editorMode, setEditorMode] = useState<HtmlEditorMode>("text");
  const [htmlContent, setHtmlContent] = useState("");
  const [category, setCategory] = useState<BoardEditCategory>(initialCategory);
  const [attachments, setAttachments] = useState<AttachmentItem[]>(initialAttachments);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgressLabel, setUploadProgressLabel] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [urlLink, setUrlLink] = useState("");
  const [urlName, setUrlName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openEdit = () => {
    setTitle(initialTitle);
    if (initialContentType === "html") {
      setEditorMode("html");
      setHtmlContent(initialDescription);
      setBodyContent("");
    } else {
      setEditorMode("text");
      setBodyContent(initialDescription);
      setHtmlContent("");
    }
    setCategory(initialCategory);
    setAttachments([...initialAttachments]);
    setUrlLink("");
    setUrlName("");
    setEditOpen(true);
  };

  const handleAddUrl = () => {
    const link = urlLink.trim();
    if (!link) return;
    if (attachments.length >= 20) return;
    setAttachments((prev) => [...prev, { url: link, name: urlName.trim() || "링크" }]);
    setUrlLink("");
    setUrlName("");
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    if (attachments.length + files.length > 20) {
      toast.error("첨부파일은 최대 20개까지 가능합니다.");
      return;
    }
    setUploading(true);
    setUploadProgressLabel(null);
    try {
      const results = await uploadEachFileSequentially(files, {
        onProgress: (cur, total, partL, partT) => {
          if (partL != null && partT != null && partT > 0) {
            setUploadProgressLabel(`${cur}/${total} · ${Math.round((100 * partL) / partT)}%`);
          } else {
            setUploadProgressLabel(`${cur}/${total} 업로드 중…`);
          }
        },
      });
      const successes = results.filter((r) => r.status === "success");
      if (successes.length > 0) {
        setAttachments((prev) => [
          ...prev,
          ...successes.map((r) => ({
            url: r.url,
            name: r.name ?? r.file.name,
          })),
        ]);
      }
      const { ok, failed, skipped } = summarizeSequentialUploadResults(results);
      if (failed > 0) {
        toast.warning(`${ok}개 성공, ${failed}개 실패. 실패한 파일은 다시 시도해 주세요.`, {
          duration: UPLOAD_TOAST_DURATION_MS,
        });
      } else if (skipped > 0 && ok > 0) {
        toast.success(`${ok}개 성공 (${skipped}개 빈 파일 제외)`);
      } else if (skipped > 0 && ok === 0) {
        toast.message(`빈 파일 ${skipped}개는 건너뛰었습니다.`);
      } else if (ok > 0) {
        toast.success(`${ok}개 모두 업로드 완료`);
      }
    } finally {
      setUploading(false);
      setUploadProgressLabel(null);
      e.target.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!title.trim()) {
      toast.error("제목을 입력하세요.");
      return;
    }
    setSubmitLoading(true);
    try {
      const isHtmlPayload = editorMode === "html" || editorMode === "preview";
      /** POST는 PATCH와 동일 처리(API route). 일부 환경에서 PATCH가 비정상일 때 대비 */
      const res = await fetch(`/api/board/${postId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: (isHtmlPayload ? htmlContent : bodyContent).trim() || "",
          contentType: isHtmlPayload ? "html" : "text",
          category,
          attachments,
        }),
      });
      const data = await readBoardMutationJson(res);
      if (!res.ok) {
        const msg =
          data.error ??
          data.message ??
          (res.status === 409 ? "저장이 거절되었습니다(409). 새로고침 후 다시 시도해 주세요." : null) ??
          `수정 실패 (${res.status})`;
        throw new Error(msg);
      }
      toast.success("수정되었습니다.");
      setEditOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "수정에 실패했습니다.");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("이 자료를 삭제(숨김)할까요? 관리자는 휴지통에서 복원하거나 영구 삭제할 수 있습니다.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/board/${postId}`, { method: "DELETE" });
      const data = await readBoardMutationJson(res);
      if (!res.ok) throw new Error(data.error ?? "삭제 실패");
      toast.success("삭제되었습니다.");
      router.push("/board");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
      setDeleting(false);
    }
  };

  if (!canEdit) return null;

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={openEdit} className="gap-1">
          <Pencil className="size-4" />
          수정
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDelete}
          disabled={deleting}
          className="gap-1 text-destructive hover:text-destructive"
        >
          {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          삭제
        </Button>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent
          fullScreen
          className="gap-0"
          onPointerDownOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14">
            <DialogTitle>자료 수정</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleSubmitEdit}
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4 pb-8"
          >
            <div className="space-y-2">
              <Label htmlFor="edit-board-title">제목</Label>
              <Input
                id="edit-board-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="제목을 입력하세요"
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-board-category">구분</Label>
              <select
                id="edit-board-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as BoardEditCategory)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="COMPANY">회사 자료</option>
                <option value="TRAINING">교육자료</option>
                <option value="FREE">자유게시판</option>
                <option value="ANONYMOUS">익명게시판</option>
                <option value="MEETING">회의록</option>
              </select>
              {category === "ANONYMOUS" && (
                <p className="text-muted-foreground text-xs">
                  익명게시판으로 저장되면 목록·상세에 작성자는 &quot;익명&quot;으로만 보입니다. (대표 계정은 실명 확인 가능)
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>설명</Label>
              <HtmlEditorModeTabs
                editorMode={editorMode}
                setEditorMode={setEditorMode}
                htmlContent={htmlContent}
                setHtmlContent={setHtmlContent}
                textEditor={
                  <ContentBodyEditor
                    key={editOpen ? "edit-rich-open" : "edit-rich-closed"}
                    initialContent={bodyContent}
                    onChange={setBodyContent}
                    minHeight="clamp(360px, 58vh, 900px)"
                    showHelp={true}
                  />
                }
              />
            </div>
            <div className="space-y-2">
              <Label>첨부파일 / 링크</Label>
              <div className="flex flex-wrap items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  accept="*/*"
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
                  {uploading ? uploadProgressLabel ?? "업로드 중…" : "파일 선택"}
                </Button>
                <Input
                  placeholder="URL 입력"
                  value={urlLink}
                  onChange={(e) => setUrlLink(e.target.value)}
                  className="h-9 flex-1 min-w-[120px] text-sm"
                />
                <Input
                  placeholder="이름 (선택)"
                  value={urlName}
                  onChange={(e) => setUrlName(e.target.value)}
                  className="h-9 w-24 text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddUrl}
                  disabled={attachments.length >= 20 || !urlLink.trim()}
                >
                  URL 추가
                </Button>
              </div>
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
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                취소
              </Button>
              <Button type="submit" disabled={submitLoading}>
                {submitLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
                저장
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
