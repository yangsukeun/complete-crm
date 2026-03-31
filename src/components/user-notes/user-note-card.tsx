"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { MoreVertical, Trash2, FolderKanban, FileText } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FilePreviewDialog } from "@/components/file-preview-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HtmlEditorModeTabs, type HtmlEditorMode } from "@/components/html-editor-mode-tabs";
import { TASK_BODY_DOC_PREFIX } from "@/lib/task-body-description";
import type { UserNoteAttachment, UserNoteDto } from "./types";
import { cn } from "@/lib/utils";
import type { BoardCategory } from "@/lib/board-category";
import { isBoardCategory } from "@/lib/board-category";
import {
  postUploadFile,
  UPLOAD_ERROR_MESSAGE,
  UPLOAD_TOAST_DURATION_MS,
} from "@/lib/upload-client-validate";

/** 게시판 글쓰기(`board-new-client`)와 동일: BlockNote + HTML 탭, SSR 비활성로 하이드레이션 안전 */
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

const BODY_SAVE_DEBOUNCE_MS = 800;
const MAX_ATTACHMENTS = 20;

const NOTE_CATEGORY_LABEL: Record<BoardCategory, string> = {
  COMPANY: "회사 자료",
  TRAINING: "교육자료",
  FREE: "자유게시판",
  ANONYMOUS: "익명게시판",
};

type PatchBody = {
  title?: string;
  content?: string;
  contentType?: "text" | "html";
  category?: string;
  attachments?: UserNoteAttachment[];
};

function isBlockNoteDoc(content: string): boolean {
  return (content ?? "").trimStart().startsWith(TASK_BODY_DOC_PREFIX);
}

type Props = {
  note: UserNoteDto;
  showProjectLink?: boolean;
  showConvertToProject?: boolean;
  onPatch: (id: string, body: PatchBody) => Promise<UserNoteDto | void>;
  onDelete: (id: string) => Promise<void>;
  onRequestConvert: (note: UserNoteDto) => void;
};

export function UserNoteCard({
  note,
  showProjectLink = true,
  showConvertToProject = false,
  onPatch,
  onDelete,
  onRequestConvert,
}: Props) {
  const [title, setTitle] = useState(note.title);
  const [category, setCategory] = useState<BoardCategory>(() =>
    note.category && isBoardCategory(note.category) ? note.category : "COMPANY"
  );
  const [attachments, setAttachments] = useState<UserNoteAttachment[]>(() =>
    Array.isArray(note.attachments) ? note.attachments : []
  );
  const [editorMode, setEditorMode] = useState<HtmlEditorMode>("text");
  const [htmlContent, setHtmlContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [urlLink, setUrlLink] = useState("");
  const [urlName, setUrlName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isStoredHtml = note.contentType === "html" && !isBlockNoteDoc(note.content);

  const noteRef = useRef(note);
  noteRef.current = note;
  const titleRef = useRef(title);
  titleRef.current = title;
  const editorModeRef = useRef(editorMode);
  editorModeRef.current = editorMode;

  const draftBodyRef = useRef(note.content);
  const bodyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (bodyDebounceRef.current) clearTimeout(bodyDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    setTitle(note.title);
    setCategory(note.category && isBoardCategory(note.category) ? note.category : "COMPANY");
    setAttachments(Array.isArray(note.attachments) ? note.attachments : []);
    draftBodyRef.current = note.content;
    if (isStoredHtml) {
      setHtmlContent(note.content);
      setEditorMode("html");
    } else {
      setHtmlContent("");
      setEditorMode("text");
    }
  }, [note.id, note.updatedAt, note.title, note.content, note.contentType, note.category, note.attachments, isStoredHtml]);

  const persistAttachments = useCallback(
    async (next: UserNoteAttachment[]) => {
      if (next.length > MAX_ATTACHMENTS) {
        toast.error(`첨부는 최대 ${MAX_ATTACHMENTS}개까지 가능합니다.`);
        return;
      }
      setAttachments(next);
      setSaving(true);
      try {
        await onPatch(note.id, { attachments: next });
      } finally {
        setSaving(false);
      }
    },
    [note.id, onPatch]
  );

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      toast.error(`첨부는 최대 ${MAX_ATTACHMENTS}개까지 가능합니다.`);
      return;
    }
    setUploading(true);
    let list = [...attachments];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const data = await postUploadFile(file);
        list = [...list, { url: data.url, name: data.name ?? file.name }];
      }
      await persistAttachments(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : UPLOAD_ERROR_MESSAGE.server, {
        duration: UPLOAD_TOAST_DURATION_MS,
      });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleAddUrl = async () => {
    const link = urlLink.trim();
    if (!link) {
      toast.error("URL을 입력하세요.");
      return;
    }
    if (attachments.length >= MAX_ATTACHMENTS) {
      toast.error(`첨부는 최대 ${MAX_ATTACHMENTS}개까지 가능합니다.`);
      return;
    }
    const next = [...attachments, { url: link, name: urlName.trim() || "링크" }];
    setUrlLink("");
    setUrlName("");
    await persistAttachments(next);
  };

  const removeAttachment = async (index: number) => {
    const next = attachments.filter((_, i) => i !== index);
    await persistAttachments(next);
  };

  const flushDebouncedText = useCallback(async () => {
    if (bodyDebounceRef.current) {
      clearTimeout(bodyDebounceRef.current);
      bodyDebounceRef.current = null;
    }
    const body = draftBodyRef.current;
    const n = noteRef.current;
    if (body === n.content && n.contentType === "text") return;
    setSaving(true);
    try {
      await onPatch(note.id, { content: body, contentType: "text" });
    } finally {
      setSaving(false);
    }
  }, [note.id, onPatch]);

  const flushHtmlIfDirty = useCallback(async () => {
    const n = noteRef.current;
    if (htmlContent === n.content && n.contentType === "html") return;
    if (!htmlContent.trim() && n.contentType === "text" && isBlockNoteDoc(n.content)) return;
    setSaving(true);
    try {
      await onPatch(note.id, { content: htmlContent, contentType: "html" });
    } finally {
      setSaving(false);
    }
  }, [htmlContent, note.id, onPatch]);

  const scheduleBlockNoteSave = useCallback(
    (body: string) => {
      draftBodyRef.current = body;
      if (bodyDebounceRef.current) clearTimeout(bodyDebounceRef.current);
      bodyDebounceRef.current = setTimeout(async () => {
        bodyDebounceRef.current = null;
        if (editorModeRef.current !== "text") return;
        const n = noteRef.current;
        if (body === n.content && titleRef.current.trim() === n.title) return;
        setSaving(true);
        try {
          await onPatch(note.id, { content: body, contentType: "text" });
        } finally {
          setSaving(false);
        }
      }, BODY_SAVE_DEBOUNCE_MS);
    },
    [note.id, onPatch]
  );

  const handleEditorModeChange = (m: HtmlEditorMode) => {
    if (m === editorMode) return;
    if (editorMode === "text" && m !== "text") {
      void flushDebouncedText();
    }
    if ((editorMode === "html" || editorMode === "preview") && m !== "html" && m !== "preview") {
      void flushHtmlIfDirty();
    }
    setEditorMode(m);
  };

  const handleTitleBlur = () => {
    if (title.trim() === note.title) return;
    setSaving(true);
    const body =
      editorMode === "html" || editorMode === "preview" ? htmlContent : draftBodyRef.current;
    const ct: "text" | "html" = editorMode === "html" || editorMode === "preview" ? "html" : "text";
    if (ct === "html" && !htmlContent.trim() && note.contentType === "text" && isBlockNoteDoc(note.content)) {
      setSaving(false);
      return;
    }
    void onPatch(note.id, {
      title: title.trim(),
      content: body,
      contentType: ct,
      category,
      attachments,
    }).finally(() => setSaving(false));
  };

  const handleCategoryChange = (value: BoardCategory) => {
    setCategory(value);
    setSaving(true);
    void onPatch(note.id, { category: value }).finally(() => setSaving(false));
  };

  const bg = note.colorHex ?? "#fef9c3";

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-lg border border-black/5 px-3 py-3 shadow-sm transition-shadow",
        "hover:shadow-md dark:border-white/10"
      )}
      style={{ backgroundColor: bg }}
    >
      <div className="mb-2 flex items-start gap-1">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          placeholder="제목"
          className="h-auto min-w-0 flex-1 border-none bg-transparent px-0 py-0.5 text-sm font-semibold shadow-none focus-visible:ring-0"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-foreground/70 opacity-70 hover:opacity-100"
              aria-label="메모 메뉴"
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {showConvertToProject ? (
              <DropdownMenuItem onSelect={() => onRequestConvert(note)}>
                <FolderKanban className="mr-2 size-4" />
                프로젝트로 만들기
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => void onDelete(note.id)}
            >
              <Trash2 className="mr-2 size-4" />
              삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mb-2 space-y-1.5">
        <Label className="text-[11px] text-foreground/70">구분 (게시판과 동일)</Label>
        <select
          value={category}
          onChange={(e) => handleCategoryChange(e.target.value as BoardCategory)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {(Object.keys(NOTE_CATEGORY_LABEL) as BoardCategory[]).map((key) => (
            <option key={key} value={key}>
              {NOTE_CATEGORY_LABEL[key]}
            </option>
          ))}
        </select>
        {category === "ANONYMOUS" ? (
          <p className="text-[10px] leading-snug text-amber-800/90 dark:text-amber-200/90">
            메모는 본인에게만 보이지만, 구분 라벨만 게시판의 「익명게시판」과 같이 맞춥니다.
          </p>
        ) : null}
      </div>

      <HtmlEditorModeTabs
        editorMode={editorMode}
        setEditorMode={handleEditorModeChange}
        htmlContent={htmlContent}
        setHtmlContent={setHtmlContent}
        onHtmlBlur={() => void flushHtmlIfDirty()}
        textEditor={
          <ContentBodyEditor
            key={`${note.id}-${note.contentType}-${note.updatedAt}`}
            initialContent={isStoredHtml ? "" : note.content}
            onChange={(body) => {
              draftBodyRef.current = body;
              scheduleBlockNoteSave(body);
            }}
            minHeight="320px"
            showHelp={true}
          />
        }
        emptyPreviewMessage="HTML 탭에서 코드를 입력하면 여기에 표시됩니다"
      />

      <div className="mt-3 space-y-2 rounded-md border border-black/10 bg-background/40 p-2 dark:border-white/10">
        <Label className="text-[11px] text-foreground/70">첨부파일 / 링크 (게시판과 동일)</Label>
        <div className="flex flex-wrap items-end gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,image/*,video/*,.mp4,.webm,.ogg,.mov,.txt,.heic,.heif,.avif"
            onChange={(e) => void handleFileSelect(e)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={uploading || attachments.length >= MAX_ATTACHMENTS}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileText className="mr-1 size-3.5" />
            {uploading ? "업로드 중…" : "파일"}
          </Button>
          <Input
            placeholder="URL"
            value={urlLink}
            onChange={(e) => setUrlLink(e.target.value)}
            className="h-8 min-w-[120px] flex-1 text-xs"
          />
          <Input
            placeholder="이름"
            value={urlName}
            onChange={(e) => setUrlName(e.target.value)}
            className="h-8 w-20 text-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={attachments.length >= MAX_ATTACHMENTS || !urlLink.trim()}
            onClick={() => void handleAddUrl()}
          >
            URL 추가
          </Button>
        </div>
        {attachments.length > 0 ? (
          <ul className="max-h-28 space-y-1 overflow-y-auto text-xs">
            {attachments.map((att, idx) => (
              <li key={`${att.url}-${idx}`} className="flex items-center gap-1">
                <FilePreviewDialog
                  url={att.url}
                  name={att.name}
                  triggerVariant="ghost"
                  triggerClassName="h-7 flex-1 justify-start truncate px-1 text-xs font-normal"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  onClick={() => void removeAttachment(idx)}
                  aria-label="첨부 제거"
                >
                  <Trash2 className="size-3" />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {saving ? (
        <p className="mt-1 text-[10px] text-muted-foreground">저장 중…</p>
      ) : null}

      {showProjectLink && note.project ? (
        <p className="mt-2 text-xs text-foreground/65">
          연결: {note.project.brand.name} / {note.project.name}
        </p>
      ) : null}
    </div>
  );
}
