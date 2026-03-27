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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatUserName } from "@/lib/utils";
import { TaskAssigneeAvatars } from "@/components/task-assignee-avatars";

type User = {
  id: string;
  name: string;
  email: string;
  department: string | null;
  position?: string | null;
  image?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  parentId?: string | null;
  orderIndex?: number;
  /** 담당자를 미리 선택 (단일, 하위 호환) */
  defaultAssignedToId?: string | null;
  /** 여러 담당자 미선택 */
  defaultAssigneeIds?: string[] | null;
  /** 이 카테고리 아래에 프로젝트 추가 */
  categoryId?: string | null;
};

export function CreateTaskModal({
  open,
  onOpenChange,
  onCreated,
  parentId = null,
  orderIndex = 0,
  defaultAssignedToId = null,
  defaultAssigneeIds = null,
  categoryId = null,
}: Props) {
  const [users, setUsers] = useState<User[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<"HIGH" | "MEDIUM" | "LOW">("MEDIUM");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingUsers(true);
    fetch("/api/users")
      .then((res: Response) => (res.ok ? res.json() : []))
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false));
  }, [open]);

  useEffect(() => {
    if (open) {
      const d = new Date();
      d.setHours(23,59,59,999);
      setDueDate(d.toISOString().slice(0, 16));
      setTitle("");
      setDescription("");
      setPriority("MEDIUM");
      const initial =
        defaultAssigneeIds != null && defaultAssigneeIds.length > 0
          ? [...new Set(defaultAssigneeIds)]
          : defaultAssignedToId
            ? [defaultAssignedToId]
            : [];
      setAssigneeIds(initial);
    }
  }, [open, defaultAssignedToId, defaultAssigneeIds]);

  const toggleAssignee = (userId: string) => {
    setAssigneeIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("제목을 입력하세요.");
      return;
    }
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
          assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
          parentId: parentId ?? undefined,
          categoryId: categoryId ?? undefined,
          orderIndex,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "프로젝트 생성에 실패했습니다.");
      }
      toast.success("프로젝트가 할당되었습니다.");
      onCreated();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "프로젝트 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const selectedUsers = users.filter((u) => assigneeIds.includes(u.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>새 프로젝트 만들기</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>담당 직원 (복수 선택 가능)</Label>
            <p className="text-muted-foreground text-xs">비워 두면 본인에게 배정됩니다.</p>
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <TaskAssigneeAvatars assignees={selectedUsers} size={26} />
                <div className="flex flex-wrap gap-1">
                  {selectedUsers.map((u) => (
                    <Badge key={u.id} variant="secondary" className="font-normal">
                      {formatUserName(u)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="max-h-40 overflow-y-auto rounded-md border bg-muted/20 p-2 space-y-2">
              {loadingUsers ? (
                <p className="text-muted-foreground text-sm px-1 py-2">불러오는 중...</p>
              ) : (
                users.map((u) => (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/60"
                  >
                    <Checkbox checked={assigneeIds.includes(u.id)} onCheckedChange={() => toggleAssignee(u.id)} />
                    <span className="flex-1">
                      {formatUserName(u)}
                      {u.department ? ` · ${u.department}` : ""}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-title">제목</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
              placeholder="프로젝트 제목"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-desc">설명</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
              placeholder="설명 (선택)"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-due">프로젝트 마감일</Label>
            <Input
              id="task-due"
              type="datetime-local"
              value={dueDate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDueDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>우선순위</Label>
            <Select value={priority} onValueChange={(v: string) => setPriority(v as "HIGH" | "MEDIUM" | "LOW")}>
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
