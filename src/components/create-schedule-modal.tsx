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

type User = { id: string; name: string; email: string; department: string | null };

function toDatetimeLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  /** 캘린더에서 시간/일정 클릭 시 넘겨준 시작·종료 */
  defaultStart?: Date;
  defaultEnd?: Date;
  /** AI 직원 요청 등에서 미리 선택할 초대 대상 */
  defaultInviteUserIds?: string[];
};

export function CreateScheduleModal({ open, onOpenChange, onCreated, defaultStart, defaultEnd, defaultInviteUserIds }: Props) {
  const [users, setUsers] = useState<User[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [isAllDay, setIsAllDay] = useState(false);
  const [inviteUserIds, setInviteUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      const start = defaultStart ?? new Date();
      const end = defaultEnd ?? (() => {
        const e = new Date(start);
        e.setHours(e.getHours() + 1);
        return e;
      })();
      setStartTime(toDatetimeLocal(start));
      setEndTime(toDatetimeLocal(end));
      setTitle("");
      setDescription("");
      setInviteUserIds(Array.isArray(defaultInviteUserIds) ? defaultInviteUserIds : []);
      fetch("/api/users/list")
        .then((r: any) => (r.ok ? r.json() : []))
        .then(setUsers)
        .catch(() => setUsers([]));
    }
  }, [open, defaultStart?.getTime(), defaultEnd?.getTime(), defaultInviteUserIds?.join(",")]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("제목을 입력하세요.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          isAllDay: isAllDay,
          inviteUserIds: inviteUserIds.length > 0 ? inviteUserIds : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "일정 생성 실패");
      }
      toast.success(inviteUserIds.length > 0 ? "일정이 등록되었고 공유 초대를 보냈습니다." : "일정이 등록되었습니다.");
      onCreated();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "일정 등록에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>새 일정</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="s-title">제목</Label>
            <Input
              id="s-title"
              value={title}
              onChange={(e: any) => setTitle(e.target.value)}
              placeholder="일정 제목"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-desc">설명</Label>
            <Textarea
              id="s-desc"
              value={description}
              onChange={(e: any) => setDescription(e.target.value)}
              placeholder="설명 (선택)"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>시작</Label>
              <Input
                type="datetime-local"
                value={startTime}
                onChange={(e: any) => setStartTime(e.target.value)}
                disabled={isAllDay}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>종료</Label>
              <Input
                type="datetime-local"
                value={endTime}
                onChange={(e: any) => setEndTime(e.target.value)}
                disabled={isAllDay}
                required
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="s-allday"
              checked={isAllDay}
              onCheckedChange={(v: any) => setIsAllDay(v === true)}
            />
            <Label htmlFor="s-allday">종일</Label>
          </div>
          <div className="space-y-2">
            <Label>공유할 직원 (선택)</Label>
            <p className="text-muted-foreground text-xs">
              선택한 직원에게 일정 공유 초대가 전송됩니다. 동의 시 해당 직원 일정표에 추가됩니다.
            </p>
            <div className="max-h-32 space-y-1 overflow-y-auto rounded border p-2">
              {users.map((u: any) => (
                <label
                  key={u.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={inviteUserIds.includes(u.id)}
                    onCheckedChange={(checked: any) =>
                      setInviteUserIds((prev: any) =>
                        checked ? [...prev, u.id] : prev.filter((id: any) => id !== u.id)
                      )
                    }
                  />
                  <span className="text-sm">
                    {u.name}
                    {u.department ? ` (${u.department})` : ""}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "등록 중..." : "등록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
