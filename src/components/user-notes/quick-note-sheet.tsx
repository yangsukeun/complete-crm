"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Pin, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { mutate } from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { contentToPlainText } from "@/lib/export/plain-from-content";
import { cn } from "@/lib/utils";
import type { UserNoteDto } from "./types";

function normalizeNotesPayload(json: unknown): UserNoteDto[] {
  if (Array.isArray(json)) return json as UserNoteDto[];
  if (
    json &&
    typeof json === "object" &&
    "notes" in json &&
    Array.isArray((json as { notes: unknown }).notes)
  ) {
    return (json as { notes: UserNoteDto[] }).notes;
  }
  return [];
}

function unwrapNote(data: unknown): UserNoteDto {
  if (data && typeof data === "object" && "note" in data) {
    const n = (data as { note: UserNoteDto }).note;
    if (n && typeof n === "object" && "id" in n) return n;
  }
  return data as UserNoteDto;
}

/**
 * 어느 화면에서든 FAB로 띄우는 빠른 메모.
 * 본문 편집기 없이 제목·텍스트만 저장하고, 자세한 편집은 메모장으로 보낸다.
 */
export function QuickNoteSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pin, setPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState<UserNoteDto[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingRecent(true);
    void fetch("/api/user-notes")
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        const list = normalizeNotesPayload(data);
        const sorted = [...list].sort((a, b) => {
          const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
          if (pinDiff !== 0) return pinDiff;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
        setRecent(sorted.slice(0, 5));
      })
      .catch(() => setRecent([]))
      .finally(() => setLoadingRecent(false));
  }, [open]);

  const resetForm = () => {
    setTitle("");
    setContent("");
    setPin(false);
  };

  const handleSave = async () => {
    const t = title.trim();
    const c = content.trim();
    if (!t && !c) {
      toast.error("제목이나 내용을 입력하세요.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/user-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          content: c,
          contentType: "text",
          pinned: pin,
        }),
      });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof (raw as { error?: string }).error === "string"
            ? (raw as { error: string }).error
            : "저장 실패"
        );
      }
      const created = unwrapNote(raw);
      void mutate("/api/user-notes");
      toast.success(pin ? "고정 메모로 저장했습니다." : "메모를 저장했습니다.", {
        action: {
          label: "열기",
          onClick: () => {
            window.location.href = `/notes?note=${encodeURIComponent(created.id)}`;
          },
        },
      });
      resetForm();
      setRecent((prev) => [created, ...prev].slice(0, 5));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) resetForm();
        onOpenChange(o);
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col p-5 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <StickyNote className="size-4 text-amber-600" />
            빠른 메모
          </SheetTitle>
          <SheetDescription>
            지금 떠오른 내용을 바로 적습니다. 서식·첨부는 메모장에서 이어서 편집하세요.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목 (선택)"
            className="font-medium"
            autoFocus
          />
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="메모 내용…"
            className="min-h-[180px] flex-1 resize-none"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void handleSave();
              }
            }}
          />
          <button
            type="button"
            onClick={() => setPin((p) => !p)}
            className={cn(
              "flex items-center gap-2 self-start rounded-md border px-2.5 py-1.5 text-xs transition-colors",
              pin
                ? "border-amber-400 bg-amber-50 text-amber-800"
                : "text-muted-foreground hover:bg-muted/60"
            )}
          >
            <Pin className={cn("size-3.5", pin && "fill-amber-600")} />
            {pin ? "맨 위에 고정" : "고정하지 않음"}
          </button>

          <div className="space-y-1.5 border-t pt-3">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs font-semibold">최근·고정</p>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
                <Link href="/notes" prefetch={false} onClick={() => onOpenChange(false)}>
                  메모장 전체
                  <ExternalLink className="ml-1 size-3" />
                </Link>
              </Button>
            </div>
            {loadingRecent ? (
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Loader2 className="size-3 animate-spin" />
                불러오는 중…
              </p>
            ) : recent.length === 0 ? (
              <p className="text-muted-foreground text-xs">아직 메모가 없습니다.</p>
            ) : (
              <ul className="space-y-1">
                {recent.map((n) => {
                  const excerpt =
                    contentToPlainText(n.content, n.contentType ?? null).trim().slice(0, 48) ||
                    "(내용 없음)";
                  return (
                    <li key={n.id}>
                      <Link
                        href={`/notes?note=${encodeURIComponent(n.id)}`}
                        prefetch={false}
                        onClick={() => onOpenChange(false)}
                        className="hover:bg-muted/60 flex items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
                      >
                        {n.pinned && (
                          <Pin className="mt-0.5 size-3 shrink-0 fill-amber-600 text-amber-700" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">
                            {n.title.trim() || "(제목 없음)"}
                          </span>
                          <span className="text-muted-foreground block truncate text-[11px]">
                            {excerpt}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <SheetFooter className="mt-3 flex-row gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button
            type="button"
            disabled={saving || (!title.trim() && !content.trim())}
            onClick={() => void handleSave()}
            className="bg-amber-500 text-amber-950 hover:bg-amber-600"
          >
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            저장
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
