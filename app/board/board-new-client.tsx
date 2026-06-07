"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Loader2, Sparkles, Trash2 } from "lucide-react";
import { coerceBoardCategory, type BoardCategory } from "@/lib/board-category";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HtmlEditorModeTabs, type HtmlEditorMode } from "@/components/html-editor-mode-tabs";
import { toast } from "sonner";
import {
  summarizeSequentialUploadResults,
  uploadEachFileSequentially,
  UPLOAD_TOAST_DURATION_MS,
} from "@/lib/upload-client-validate";
import { useWorkspaceStore } from "@/store/workspace-store";
import { BOARD_NEW_POST_EVENT } from "@/lib/board-last-seen";
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
  return coerceBoardCategory(raw);
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
  const [rawNote, setRawNote] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgressLabel, setUploadProgressLabel] = useState<string | null>(null);
  const [urlLink, setUrlLink] = useState("");
  const [urlName, setUrlName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const meetingTemplateAppliedRef = useRef(false);

  useEffect(() => {
    if (category !== "MEETING") {
      meetingTemplateAppliedRef.current = false;
      return;
    }
    if (meetingTemplateAppliedRef.current) return;
    if (bodyContent.trim() || htmlContent.trim()) return;

    const today = new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(new Date())
      .replaceAll(". ", "년 ")
      .replaceAll(".", "일")
      .replace("년", "년 ")
      .replace("월", "월 ");

    const template = `
## 회의 정보
- 일시: ${today}
- 장소:
- 참석자:

## 안건

## 논의 내용

## 결정 사항

## 액션 아이템
- [ ] 담당자:  / 기한:
    `.trim();

    setEditorMode("text");
    setBodyContent(template);
    setHtmlContent("");
    meetingTemplateAppliedRef.current = true;
  }, [category, bodyContent, htmlContent]);

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
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(BOARD_NEW_POST_EVENT));
      }
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
            <option value="MEETING">회의록</option>
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
          {category === "MEETING" && (
            <div className="mb-2 rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-900/40 dark:bg-purple-950/30">
              <p className="mb-2 text-sm font-medium text-purple-800 dark:text-purple-200">
                AI 회의록 자동 정리
              </p>
              <p className="mb-3 text-xs text-purple-600 dark:text-purple-300">
                미팅에서 나눈 대화/메모를 붙여넣으면 AI가 회의록 형태로 정리해 드립니다.
              </p>
              <textarea
                value={rawNote}
                onChange={(e) => setRawNote(e.target.value)}
                placeholder="미팅 내용을 여기에 붙여넣으세요..."
                className="h-32 w-full resize-none rounded-md border bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 dark:bg-slate-950"
              />
              <Button
                type="button"
                onClick={async () => {
                  if (!rawNote.trim()) return;
                  setAiLoading(true);
                  try {
                    const res = await fetch("/api/meeting/summarize", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ content: rawNote }),
                    });
                    const data = (await res.json()) as { summary?: string; error?: string };
                    if (!res.ok) throw new Error(data.error ?? "AI 정리에 실패했습니다.");
                    if (data.summary) {
                      setEditorMode("text");
                      setBodyContent(data.summary);
                      setHtmlContent("");
                      setRawNote("");
                      toast.success("AI가 회의록을 정리했어요!");
                    }
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "정리 중 오류가 발생했어요");
                  } finally {
                    setAiLoading(false);
                  }
                }}
                disabled={aiLoading || !rawNote.trim()}
                className="mt-2 gap-2 bg-purple-600 text-white hover:bg-purple-700"
              >
                {aiLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    AI 정리 중...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    AI로 회의록 정리하기
                  </>
                )}
              </Button>
            </div>
          )}
          <HtmlEditorModeTabs
            editorMode={editorMode}
            setEditorMode={setEditorMode}
            htmlContent={htmlContent}
            setHtmlContent={setHtmlContent}
            htmlPageMode
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
