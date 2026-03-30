"use client";

import { useRef, useState, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Loader2, Trash2 } from "lucide-react";
import type { BoardCategory } from "@/lib/board-category";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HtmlEditorModeTabs, type HtmlEditorMode } from "@/components/html-editor-mode-tabs";
import { toast } from "sonner";
import {
  postUploadFile,
  UPLOAD_ERROR_MESSAGE,
  UPLOAD_TOAST_DURATION_MS,
} from "@/lib/upload-client-validate";
import { useWorkspaceStore } from "@/store/workspace-store";
import { FilePreviewDialog } from "@/components/file-preview-dialog";

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

type AttachmentItem = { url: string; name: string };

function parseCategory(raw: string | undefined): BoardCategory {
  if (raw === "COMPANY" || raw === "TRAINING" || raw === "FREE" || raw === "ANONYMOUS") return raw;
  return "COMPANY";
}

export function BoardNewClient({ initialCategory }: { initialCategory: string | undefined }) {
  const router = useRouter();
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const defaultCat = useMemo(() => parseCategory(initialCategory), [initialCategory]);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [bodyContent, setBodyContent] = useState("");
  const [editorMode, setEditorMode] = useState<HtmlEditorMode>("text");
  const [htmlContent, setHtmlContent] = useState("");
  const [category, setCategory] = useState<BoardCategory>(defaultCat);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [urlLink, setUrlLink] = useState("");
  const [urlName, setUrlName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("제목을 입력하세요.");
      return;
    }
    setSubmitLoading(true);
    try {
      const isHtmlPayload = editorMode === "html" || editorMode === "preview";
      const res = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: (isHtmlPayload ? htmlContent : bodyContent).trim() || "",
          contentType: isHtmlPayload ? "html" : "text",
          category,
          workspaceScope:
            category === "FREE" || category === "ANONYMOUS"
              ? "TEAM"
              : currentWorkspace === "MY"
                ? "PERSONAL"
                : "TEAM",
          attachments,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "등록 실패");
      toast.success("자료가 등록되었습니다.");
      router.push(`/board/${data.id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "자료 등록에 실패했습니다.");
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

  const handleAddUrl = () => {
    const link = urlLink.trim();
    if (!link) {
      toast.error("URL을 입력하세요.");
      return;
    }
    if (attachments.length >= 20) {
      toast.error("첨부는 최대 20개까지 가능합니다.");
      return;
    }
    setAttachments((prev) => [...prev, { url: link, name: urlName.trim() || "링크" }]);
    setUrlLink("");
    setUrlName("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/board">
            <ArrowLeft className="mr-2 size-4" />
            게시판으로
          </Link>
        </Button>
      </div>

      <div className="rounded-xl border-2 border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/50 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="board-new-title">제목</Label>
          <Input
            id="board-new-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목을 입력하세요"
            maxLength={200}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="board-new-category">구분</Label>
          <select
            id="board-new-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as BoardCategory)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="COMPANY">회사 자료</option>
            <option value="TRAINING">교육자료</option>
            <option value="FREE">자유게시판</option>
            <option value="ANONYMOUS">익명게시판</option>
          </select>
          {category === "ANONYMOUS" && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
              이 글은 익명으로 게시됩니다. 목록과 상세에는 작성자가 &quot;익명&quot;으로만 표시되며, 대표 계정만 실명을 확인할 수
              있습니다.
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
                key="board-new-rich"
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
            <div className="flex min-w-[200px] flex-1 items-center gap-2">
              <Input
                placeholder="URL 입력 (예: https://... 또는 /uploads/...)"
                value={urlLink}
                onChange={(e) => setUrlLink(e.target.value)}
                className="h-9 text-sm"
              />
              <Input
                placeholder="이름 (선택)"
                value={urlName}
                onChange={(e) => setUrlName(e.target.value)}
                className="h-9 w-28 text-sm"
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
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/board">취소</Link>
          </Button>
          <Button type="submit" disabled={submitLoading}>
            {submitLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
            등록
          </Button>
        </div>
      </div>
    </form>
  );
}
