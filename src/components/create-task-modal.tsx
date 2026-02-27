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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatUserName } from "@/lib/utils";

type User = { id: string; name: string; email: string; department: string | null; position?: string | null };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  parentId?: string | null;
  orderIndex?: number;
  /** 담당자를 미리 선택 (예: 본인 할일 추가 시) */
  defaultAssignedToId?: string | null;
  /** 이 카테고리 아래에 업무 추가 */
  categoryId?: string | null;
};

export function CreateTaskModal({ open, onOpenChange, onCreated, parentId = null, orderIndex = 0, defaultAssignedToId = null, categoryId = null }: Props) {
  const [users, setUsers] = useState<User[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<"HIGH" | "MEDIUM" | "LOW">("MEDIUM");
  const [assignedToId, setAssignedToId] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingUsers(true);
    fetch("/api/users")
      .then((res) => res.ok ? res.json() : [])
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false));
  }, [open]);

  useEffect(() => {
    if (open) {
      const d = new Date();
      d.setHours(23, 59, 59, 999);
      setDueDate(d.toISOString().slice(0, 16));
      setTitle("");
      setDescription("");
      setPriority("MEDIUM");
      setAssignedToId(defaultAssignedToId ?? "");
    }
  }, [open, defaultAssignedToId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("제목을 입력하세요.");
      return;
    }
    // 담당자는 선택 사항 (나중에 지정 가능)
    setLoading(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          dueDate: new Date(dueDate).toISOString(),
          priority,
          assignedToId: assignedToId || undefined, // 담당자 선택 사항
          parentId: parentId ?? undefined,
          categoryId: categoryId ?? undefined,
          orderIndex,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "업무 생성에 실패했습니다.");
      }
      toast.success("업무가 할당되었습니다.");
      onCreated();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "업무 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>새 업무 만들기</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="task-assignee">담당 직원 (선택)</Label>
            <Select
              value={assignedToId || "__none__"}
              onValueChange={(v) => setAssignedToId(v === "__none__" ? "" : v)}
              disabled={loadingUsers}
            >
              <SelectTrigger id="task-assignee">
                <SelectValue placeholder="나중에 지정" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">미지정 (나중에 선택)</SelectItem>
                {users.map((u: { id: string; name: string }) => (
                  <SelectItem key={u.id} value={u.id}>
                    {formatUserName(u)}{u.department ? ` · ${u.department}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-title">제목</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="업무 제목"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-desc">설명</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="설명 (선택)"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-due">마감일</Label>
            <Input
              id="task-due"
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>우선순위</Label>
            <Select
              value={priority}
              onValueChange={(v) => setPriority(v as "HIGH" | "MEDIUM" | "LOW")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HIGH">높음</SelectItem>
                <SelectItem value="MEDIUM">보통</SelectItem>
                <SelectItem value="LOW">낮음</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "저장 중..." : "할당"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
