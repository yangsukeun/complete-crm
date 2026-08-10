"use client";

import { MoreVertical, Trash2, FolderKanban, Paperclip, Palette } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { contentToPlainText } from "@/lib/export/plain-from-content";
import { cn } from "@/lib/utils";
import type { UserNoteDto } from "./types";

/** 메모 배경으로 쓰는 파스텔 팔레트 (서버 생성 기본색과 동일 계열) */
export const NOTE_COLOR_CHOICES = [
  "#fef08a",
  "#fde68a",
  "#fed7aa",
  "#fbcfe8",
  "#e9d5ff",
  "#bfdbfe",
  "#a7f3d0",
  "#e5e7eb",
];

export const DEFAULT_NOTE_COLOR = "#fef9c3";

/**
 * 목록에 놓이는 읽기용 타일. 편집기는 무거워서 여기서는 본문을 글자로만 보여 주고,
 * 실제 편집은 눌렀을 때 다이얼로그에서 한 건만 연다.
 */
export function UserNoteTile({
  note,
  showConvertToProject,
  showProjectLink,
  onOpen,
  onColorChange,
  onDelete,
  onRequestConvert,
}: {
  note: UserNoteDto;
  showConvertToProject?: boolean;
  showProjectLink?: boolean;
  onOpen: (id: string) => void;
  onColorChange: (id: string, colorHex: string) => void;
  onDelete: (id: string) => void;
  onRequestConvert: (note: UserNoteDto) => void;
}) {
  const excerpt = contentToPlainText(note.content, note.contentType ?? null).trim();
  const attachmentCount = Array.isArray(note.attachments) ? note.attachments.length : 0;
  const bg = note.colorHex ?? DEFAULT_NOTE_COLOR;

  return (
    <div
      className="group relative flex h-44 flex-col rounded-lg border border-black/5 shadow-sm transition-shadow hover:shadow-md dark:border-white/10"
      style={{ backgroundColor: bg }}
    >
      <button
        type="button"
        onClick={() => onOpen(note.id)}
        className="flex min-h-0 flex-1 flex-col items-start rounded-lg px-3 py-2.5 text-left outline-none"
      >
        <p className="line-clamp-1 w-full pr-7 text-sm font-semibold text-neutral-900">
          {note.title.trim() || "(제목 없음)"}
        </p>
        <p className="mt-1 line-clamp-5 min-h-0 w-full flex-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-neutral-700">
          {excerpt || "내용 없음"}
        </p>
        <span className="mt-2 flex w-full items-center gap-2 text-[11px] text-neutral-600">
          {attachmentCount > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Paperclip className="size-3" />
              {attachmentCount}
            </span>
          )}
          <span className="tabular-nums">{format(new Date(note.updatedAt), "MM.dd HH:mm")}</span>
          {showProjectLink && note.project && (
            <span className="truncate rounded bg-black/10 px-1.5 py-0.5">
              {note.project.name}
            </span>
          )}
        </span>
      </button>

      <div className="absolute right-1 top-1 opacity-60 transition-opacity group-hover:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-neutral-700 hover:bg-black/10"
              aria-label="메모 메뉴"
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Palette className="size-3.5" />
              색상
            </DropdownMenuLabel>
            <div className="flex flex-wrap gap-1 px-2 pb-2">
              {NOTE_COLOR_CHOICES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`색상 ${c}`}
                  onClick={() => onColorChange(note.id, c)}
                  className={cn(
                    "size-5 rounded-full border border-black/10 transition-transform hover:scale-110",
                    (note.colorHex ?? DEFAULT_NOTE_COLOR) === c && "ring-foreground/40 ring-2"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <DropdownMenuSeparator />
            {showConvertToProject && (
              <DropdownMenuItem onSelect={() => onRequestConvert(note)}>
                <FolderKanban className="mr-2 size-4" />
                프로젝트로 만들기
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onDelete(note.id)}
            >
              <Trash2 className="mr-2 size-4" />
              삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
