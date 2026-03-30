"use client";

import { useState, useRef } from "react";
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
import { ContentBodyEditor } from "@/components/content-body-editor";
import { HtmlEditorModeTabs, type HtmlEditorMode } from "@/components/html-editor-mode-tabs";
import { FilePreviewDialog } from "@/components/file-preview-dialog";
import { FileText, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  postUploadFile,
  UPLOAD_ERROR_MESSAGE,
  UPLOAD_TOAST_DURATION_MS,
} from "@/lib/upload-client-validate";

type AttachmentItem = { url: string; name: string };

type BoardEditCategory = "COMPANY" | "TRAINING" | "FREE" | "ANONYMOUS";

/** PATCH/DELETE가 HTML(에러 페이지·502 등)을 돌려줄 때 res.json() 대비 */
async function readBoardMutationJson(res: Response): Promise<{ error?: string }> {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      return (await res.json()) as { error?: string };
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
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const data = await postUploadFile(file);
        setAttachments((prev) => [...prev, { url: data.url, name: data.name ?? file.name }]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : UPLOAD_ERROR_MESSAGE.server, {
        duration: UPLOAD_TOAST_DURATION_MS,
      });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("제목을 입력하세요.");
      return;
    }
    setSubmitLoading(true);
    try {
      const isHtmlPayload = editorMode === "html" || editorMode === "preview";
      const res = await fetch(`/api/board/${postId}`, {
        method: "PATCH",
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
      if (!res.ok) throw new Error(data.error ?? "수정 실패");
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
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-6 gap-0">
          <DialogHeader>
            <DialogTitle>자료 수정</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitEdit} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
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
                    minHeight="320px"
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
