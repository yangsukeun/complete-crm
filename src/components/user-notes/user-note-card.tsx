"use client";

import { useEffect, useState } from "react";
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
import type { UserNoteDto } from "./types";
import { cn } from "@/lib/utils";

type PatchBody = {
  title?: string;
  content?: string;
  contentType?: "text" | "html";
};

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
  const [plainContent, setPlainContent] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(note.title);
    const ct = note.contentType === "html" ? "html" : "text";
    if (ct === "html") {
      setHtmlContent(note.content);
      setPlainContent("");
      setEditorMode("html");
    } else {
      setPlainContent(note.content);
      setHtmlContent("");
      setEditorMode("text");
    }
  }, [note.id, note.updatedAt, note.title, note.content, note.contentType]);

  const flush = async (modeOverride?: HtmlEditorMode) => {
    const mode = modeOverride ?? editorMode;
    const isHtml = mode === "html" || mode === "preview";
    const nextContent = isHtml ? htmlContent : plainContent;
    const nextType: "text" | "html" = isHtml ? "html" : "text";
    const nt = note.contentType === "html" ? "html" : "text";
    if (title.trim() === note.title && nextContent === note.content && nextType === nt) return;

    const body: PatchBody = {
      title: title.trim(),
      content: nextContent,
      contentType: nextType,
    };
    setSaving(true);
    try {
      await onPatch(note.id, body);
    } finally {
      setSaving(false);
    }
  };

  const handleTitleBlur = () => {
    if (title === note.title) return;
    void flush();
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
        setEditorMode={setEditorMode}
        htmlContent={htmlContent}
        setHtmlContent={setHtmlContent}
        onHtmlBlur={() => void flush("html")}
        textEditor={
          <textarea
            value={plainContent}
            onChange={(e) => setPlainContent(e.target.value)}
            onBlur={() => void flush("text")}
            placeholder="메모를 입력하세요…"
            rows={6}
            className="w-full resize-y rounded-md border border-input bg-background/80 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[6rem]"
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
