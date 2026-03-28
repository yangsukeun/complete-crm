"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, Trash2, FolderKanban } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sanitizeNoteHtml } from "@/lib/sanitize-note-html";
import type { UserNoteDto } from "./types";
import { cn } from "@/lib/utils";

type Props = {
  note: UserNoteDto;
  showProjectLink?: boolean;
  showConvertToProject?: boolean;
  onPatch: (id: string, body: { title?: string; content?: string }) => Promise<UserNoteDto | void>;
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
  const bodyRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    setTitle(note.title);
    if (bodyRef.current && !savingRef.current) {
      const next = sanitizeNoteHtml(note.content);
      if (bodyRef.current.innerHTML !== next) {
        bodyRef.current.innerHTML = next;
      }
    }
  }, [note.id, note.updatedAt, note.title, note.content]);

  const persist = async (nextTitle: string, html: string) => {
    savingRef.current = true;
    try {
      const clean = sanitizeNoteHtml(html);
      await onPatch(note.id, { title: nextTitle.trim(), content: clean });
    } finally {
      savingRef.current = false;
    }
  };

  const handleTitleBlur = () => {
    if (title === note.title) return;
    void persist(title, bodyRef.current?.innerHTML ?? note.content);
  };

  const handleBodyBlur = () => {
    const html = bodyRef.current?.innerHTML ?? "";
    if (html === sanitizeNoteHtml(note.content)) return;
    void persist(title, html);
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
      <div
        ref={bodyRef}
        contentEditable
        suppressContentEditableWarning
        onBlur={handleBodyBlur}
        className={cn(
          "min-h-[4.5rem] max-h-48 overflow-y-auto text-sm outline-none",
          "prose prose-sm dark:prose-invert max-w-none [&_a]:underline",
          "empty:before:text-foreground/40 empty:before:content-[attr(data-placeholder)]"
        )}
        data-placeholder="메모를 입력하세요…"
      />
      {showProjectLink && note.project ? (
        <p className="mt-2 text-xs text-foreground/65">
          연결: {note.project.brand.name} / {note.project.name}
        </p>
      ) : null}
    </div>
  );
}
