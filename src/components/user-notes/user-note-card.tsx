"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { MoreVertical, Trash2, FolderKanban } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HtmlEditorModeTabs, type HtmlEditorMode } from "@/components/html-editor-mode-tabs";
import { TASK_BODY_DOC_PREFIX } from "@/lib/task-body-description";
import type { UserNoteDto } from "./types";
import { cn } from "@/lib/utils";

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

type PatchBody = {
  title?: string;
  content?: string;
  contentType?: "text" | "html";
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
  const [editorMode, setEditorMode] = useState<HtmlEditorMode>("text");
  const [htmlContent, setHtmlContent] = useState("");
  const [saving, setSaving] = useState(false);

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
    draftBodyRef.current = note.content;
    if (isStoredHtml) {
      setHtmlContent(note.content);
      setEditorMode("html");
    } else {
      setHtmlContent("");
      setEditorMode("text");
    }
  }, [note.id, note.updatedAt, note.title, note.content, note.contentType, isStoredHtml]);

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
    void onPatch(note.id, { title: title.trim(), content: body, contentType: ct }).finally(() =>
      setSaving(false)
    );
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
