"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Loader2, Plus, Vote } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { SWR_KEYS } from "@/lib/api-swr";
import { mutate } from "swr";

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

export function AnnouncementDetailActions({
  announcementId,
  initialTitle,
  initialContent,
  initialEventDateIso,
  initialEventEndDateIso,
  initialLocation,
  initialPollOptionTexts,
  canManage,
}: {
  announcementId: string;
  initialTitle: string;
  initialContent: string;
  initialEventDateIso: string | null;
  initialEventEndDateIso: string | null;
  initialLocation: string | null;
  initialPollOptionTexts: string[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [eventDate, setEventDate] = useState(toDatetimeLocalValue(initialEventDateIso));
  const [eventEndDate, setEventEndDate] = useState(toDatetimeLocalValue(initialEventEndDateIso));
  const [location, setLocation] = useState(initialLocation ?? "");
  const [pollOptions, setPollOptions] = useState<string[]>(
    initialPollOptionTexts.length >= 2
      ? initialPollOptionTexts
      : initialPollOptionTexts.length === 1
        ? [...initialPollOptionTexts, ""]
        : ["", ""]
  );

  if (!canManage) return null;

  const openEdit = () => {
    setTitle(initialTitle);
    setContent(initialContent);
    setEventDate(toDatetimeLocalValue(initialEventDateIso));
    setEventEndDate(toDatetimeLocalValue(initialEventEndDateIso));
    setLocation(initialLocation ?? "");
    const po = initialPollOptionTexts;
    setPollOptions(po.length >= 2 ? po : po.length === 1 ? [...po, ""] : ["", ""]);
    setEditOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error("제목과 내용을 입력하세요.");
      return;
    }
    setSaving(true);
    try {
      const opts = pollOptions.map((s) => s.trim()).filter(Boolean);
      const body: Record<string, unknown> = {
        title: title.trim(),
        content: content.trim(),
        eventDate: eventDate ? new Date(eventDate).toISOString() : null,
        eventEndDate: eventEndDate ? new Date(eventEndDate).toISOString() : null,
        location: location.trim() || null,
        pollOptions: opts.length > 0 ? opts : [],
      };
      const res = await fetch(`/api/announcements/${announcementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "수정 실패");
      toast.success("공지가 수정되었습니다.");
      setEditOpen(false);
      await mutate(SWR_KEYS.announcements);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "수정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/announcements/${announcementId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "삭제 실패");
      toast.success("공지가 삭제되었습니다.");
      await mutate(SWR_KEYS.announcements);
      router.push("/announcements");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const addPoll = () => {
    if (pollOptions.length >= 20) return;
    setPollOptions([...pollOptions, ""]);
  };
  const removePoll = (i: number) => {
    if (pollOptions.length <= 2) return;
    setPollOptions(pollOptions.filter((_, idx) => idx !== i));
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={openEdit}>
          <Pencil className="size-4" />
          수정
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1 text-destructive hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="size-4" />
          삭제
        </Button>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>공지 수정</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-ann-title">제목</Label>
              <Input
                id="edit-ann-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-ann-content">내용</Label>
              <Textarea
                id="edit-ann-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                className="resize-none"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">시작 일시</Label>
                <Input type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">종료 일시</Label>
                <Input type="datetime-local" value={eventEndDate} onChange={(e) => setEventEndDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">장소</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={500} />
            </div>
            <div className="space-y-2 border-t pt-3">
              <Label className="flex items-center gap-1 text-sm">
                <Vote className="size-4" />
                투표 선택지 (비우면 투표 제거)
              </Label>
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={opt}
                    onChange={(e) => {
                      const next = [...pollOptions];
                      next[i] = e.target.value;
                      setPollOptions(next);
                    }}
                    placeholder={`선택지 ${i + 1}`}
                    maxLength={200}
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => removePoll(i)} disabled={pollOptions.length <= 2}>
                    삭제
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addPoll} disabled={pollOptions.length >= 20} className="gap-1">
                <Plus className="size-4" />
                선택지 추가
              </Button>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                취소
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                저장
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>공지 삭제</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="size-4 animate-spin" /> : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
