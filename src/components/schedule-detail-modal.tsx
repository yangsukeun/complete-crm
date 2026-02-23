"use client";

import { useState, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type ScheduleEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource?: {
    id: string;
    title: string;
    description: string | null;
    startTime: string;
    endTime: string;
    isAllDay: boolean;
    userId: string;
    userName?: string;
  };
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: ScheduleEvent | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
};

export function ScheduleDetailModal({
  open,
  onOpenChange,
  event,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [isAllDay, setIsAllDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!event?.resource) return;
    const r = event.resource;
    setTitle(r.title);
    setDescription(r.description ?? "");
    setStartTime(r.startTime.slice(0, 16));
    setEndTime(r.endTime.slice(0, 16));
    setIsAllDay(r.isAllDay);
  }, [event]);

  if (!event?.resource) return null;

  const handleSave = async () => {
    if (!event?.resource) return;
    if (!title.trim()) {
      toast.error("제목을 입력하세요.");
      return;
    }
    const id = event.resource.id;
    setSaving(true);
    try {
      const res = await fetch(`/api/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          isAllDay,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "저장에 실패했습니다.");
      }
      toast.success("일정이 수정되었습니다.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!event?.resource) return;
    if (!confirm("이 일정을 삭제하시겠습니까?")) return;
    const id = event.resource.id;
    setDeleting(true);
    try {
      const res = await fetch(`/api/schedules/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("삭제에 실패했습니다.");
      toast.success("일정이 삭제되었습니다.");
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>일정 상세</DialogTitle>
          {event.resource.userName && (
            <p className="text-muted-foreground text-sm">
              담당: {event.resource.userName}
            </p>
          )}
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="modal-title">제목</Label>
            <Input
              id="modal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="일정 제목"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="modal-desc">설명</Label>
            <Textarea
              id="modal-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="설명 (선택)"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>시작</Label>
              <Input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={isAllDay}
              />
            </div>
            <div className="space-y-2">
              <Label>종료</Label>
              <Input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={isAllDay}
              />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="modal-allday"
              checked={isAllDay}
              onCheckedChange={(v) => setIsAllDay(v === true)}
            />
            <Label htmlFor="modal-allday" className="cursor-pointer">
              종일
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={saving || deleting}
          >
            {deleting ? "삭제 중..." : "삭제"}
          </Button>
          <div className="flex-1" />
          <Button type="button" variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
