"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  ListTodo,
  Link2,
  MessageSquare,
  ExternalLink,
  Plus,
  FileText,
  Maximize2,
  Pencil,
  Check,
  X,
  Calendar,
  User,
  Flag,
  Download,
} from "lucide-react";
import { copyTaskToPersonal } from "@/actions/tasks";
import { formatUserName } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { TaskBodyEditorDynamic } from "@/components/task-body-editor-dynamic";

type User = { id: string; name: string; email?: string; department?: string | null; position?: string | null };

type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string;
  isCompleted: boolean;
  priority: string;
  scope?: "TEAM" | "PERSONAL";
  assignedTo: { id: string; name: string; email: string; position?: string | null };
  createdBy: { id: string; name: string; position?: string | null };
  attachments: { id: string; type: string; url: string; name: string | null }[];
  comments: { id: string; body: string; createdAt: string; user: { id: string; name: string; position?: string | null } }[];
};

type Props = {
  taskId: string | null;
  onClose: () => void;
  onUpdate: () => void;
};

export function TaskDetailDrawer({ taskId, onClose, onUpdate }: Props) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [togglingComplete, setTogglingComplete] = useState(false);

  const [attachType, setAttachType] = useState<"LINK" | "VIDEO" | "FILE">("LINK");
  const [attachUrl, setAttachUrl] = useState("");
  const [attachName, setAttachName] = useState("");
  const [addingAttach, setAddingAttach] = useState(false);
  const [showAddAttach, setShowAddAttach] = useState(false);

  const [commentBody, setCommentBody] = useState("");
  const [addingComment, setAddingComment] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editing states
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copyingToPersonal, setCopyingToPersonal] = useState(false);

  // Fetch users for assignee selection
  useEffect(() => {
    if (!taskId) return;
    setLoadingUsers(true);
    fetch("/api/users")
      .then((res) => res.ok ? res.json() : [])
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false));
  }, [taskId]);

  // Update task field
  const updateTask = useCallback(async (data: Record<string, unknown>) => {
    if (!task) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("수정 실패");
      const updated = await res.json();
      setTask((prev) => prev ? { ...prev, ...updated } : null);
      toast.success("수정되었습니다.");
      onUpdate();
    } catch {
      toast.error("수정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }, [task, onUpdate]);

  // Save title
  const handleSaveTitle = useCallback(() => {
    if (editTitle.trim() && editTitle.trim() !== task?.title) {
      updateTask({ title: editTitle.trim() });
    }
    setIsEditingTitle(false);
  }, [editTitle, task?.title, updateTask]);

  const fetchTask = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setTask(data);
    } catch {
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (taskId) fetchTask();
    else setTask(null);
  }, [taskId, fetchTask]);

  const handleToggleComplete = async () => {
    if (!task) return;
    setTogglingComplete(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCompleted: !task.isCompleted }),
      });
      if (!res.ok) throw new Error("Failed");
      setTask((prev) => (prev ? { ...prev, isCompleted: !prev.isCompleted } : null));
      onUpdate();
    } catch {
      toast.error("완료 상태 변경에 실패했습니다.");
    } finally {
      setTogglingComplete(false);
    }
  };

  const handleAddAttachment = async () => {
    if (!taskId || !attachUrl.trim()) {
      toast.error("URL을 입력하세요.");
      return;
    }
    try {
      new URL(attachUrl);
    } catch {
      toast.error("올바른 URL을 입력하세요.");
      return;
    }
    setAddingAttach(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: attachType,
          url: attachUrl.trim(),
          name: attachName.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "추가 실패");
      }
      toast.success("첨부가 추가되었습니다.");
      setAttachUrl("");
      setAttachName("");
      setShowAddAttach(false);
      fetchTask();
      onUpdate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "첨부 추가에 실패했습니다.");
    } finally {
      setAddingAttach(false);
    }
  };

  const uploadAndAddAttachment = useCallback(
    async (file: File) => {
      if (!taskId) return;
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "업로드 실패");
      const attachRes = await fetch(`/api/tasks/${taskId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "FILE",
          url: data.url,
          name: data.name || file.name,
        }),
      });
      if (!attachRes.ok) {
        const err = await attachRes.json();
        throw new Error(err.error ?? "첨부 추가 실패");
      }
    },
    [taskId]
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!taskId || !files?.length) return;
      setUploadingFiles(true);
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (!file.size) continue;
          await uploadAndAddAttachment(file);
        }
        toast.success("첨부가 추가되었습니다.");
        fetchTask();
        onUpdate();
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "첨부 추가에 실패했습니다.");
      } finally {
        setUploadingFiles(false);
      }
    },
    [taskId, uploadAndAddAttachment, fetchTask, onUpdate]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleAddComment = async () => {
    if (!taskId || !commentBody.trim()) {
      toast.error("댓글 내용을 입력하세요.");
      return;
    }
    setAddingComment(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentBody.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "등록 실패");
      }
      toast.success("댓글이 등록되었습니다.");
      setCommentBody("");
      fetchTask();
      onUpdate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "댓글 등록에 실패했습니다.");
    } finally {
      setAddingComment(false);
    }
  };

  const priorityLabel = task?.priority === "HIGH" ? "높음" : task?.priority === "LOW" ? "낮음" : "보통";
  const priorityColor =
    task?.priority === "HIGH"
      ? "bg-red-500/10 text-red-700 dark:text-red-400"
      : task?.priority === "LOW"
        ? "bg-slate-500/10 text-slate-600 dark:text-slate-400"
        : "bg-muted text-muted-foreground";

  return (
    <Sheet open={!!taskId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={true}
        ariaTitle="업무 상세"
        className="max-h-[100vh] w-full overflow-hidden p-0 gap-0 border-0 bg-background sm:max-w-xl"
      >
        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center px-8">
            <p className="text-muted-foreground text-sm">불러오는 중...</p>
          </div>
        ) : task ? (
          <div className="overflow-y-auto max-h-[90vh]">
            {/* 전체 화면으로 보기 + 내 서랍으로 가져오기 */}
            <div className="flex items-center justify-end gap-1 px-4 pt-3 pb-0">
              {task.scope === "TEAM" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  disabled={copyingToPersonal}
                  onClick={async () => {
                    setCopyingToPersonal(true);
                    try {
                      const result = await copyTaskToPersonal(task.id);
                      if (result.ok) {
                        toast.success("개인 업무로 저장되었습니다.");
                        onUpdate();
                      } else {
                        toast.error(result.error);
                      }
                    } finally {
                      setCopyingToPersonal(false);
                    }
                  }}
                >
                  <Download className="mr-2 size-4" />
                  내 서랍으로 가져오기
                </Button>
              )}
              <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
                <Link href={`/tasks/${task.id}`}>
                  <Maximize2 className="mr-2 size-4" />
                  전체 화면
                </Link>
              </Button>
            </div>
            {/* 노션 스타일: 페이지 상단 여백 + 블록 레이아웃 */}
            <div className="px-10 pt-8 pb-2">
              {/* 상단: 완료 체크 + 아이콘 + 제목 (노션 페이지 타이틀) */}
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={task.isCompleted}
                  onCheckedChange={handleToggleComplete}
                  disabled={togglingComplete}
                  className="mt-1.5 size-5 rounded border-2"
                />
                <span className="mt-1 text-3xl text-muted-foreground/80">
                  <ListTodo className="size-8" />
                </span>
                <div className="min-w-0 flex-1">
                  {isEditingTitle ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveTitle();
                          if (e.key === "Escape") setIsEditingTitle(false);
                        }}
                        className="text-2xl font-semibold h-auto py-1"
                        autoFocus
                      />
                      <Button size="icon" variant="ghost" className="size-8" onClick={handleSaveTitle} disabled={saving}>
                        <Check className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="size-8" onClick={() => setIsEditingTitle(false)}>
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <h1
                      className={cn(
                        "text-2xl font-semibold tracking-tight md:text-3xl cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors group flex items-center gap-2",
                        task.isCompleted && "text-muted-foreground line-through"
                      )}
                      onClick={() => {
                        setEditTitle(task.title);
                        setIsEditingTitle(true);
                      }}
                      title="클릭하여 제목 수정"
                    >
                      {task.title}
                      <Pencil className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </h1>
                  )}
                </div>
              </div>

              {/* Properties: 담당, 마감, 우선순위, 지시자 (노션 속성 행) - 클릭 수정 가능 */}
              <div className="mt-6 space-y-2">
                {/* 담당자 */}
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground w-16 flex items-center gap-1.5">
                    <User className="size-3.5" />
                    담당
                  </span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="rounded-md bg-muted px-2 py-0.5 font-medium hover:bg-violet-100 hover:text-violet-700 transition-colors flex items-center gap-1">
                        {task.assignedTo ? formatUserName(task.assignedTo) : "미지정"}
                        <Pencil className="size-3 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="start">
                      <div className="space-y-1 max-h-[200px] overflow-y-auto">
                        {loadingUsers ? (
                          <p className="text-xs text-muted-foreground p-2">불러오는 중...</p>
                        ) : (
                          users.map((u: any) => (
                            <button
                              key={u.id}
                              onClick={() => updateTask({ assignedToId: u.id })}
                              className={cn(
                                "w-full text-left px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors",
                                task.assignedTo?.id === u.id && "bg-violet-100 text-violet-700"
                              )}
                            >
                              {formatUserName(u)}
                            </button>
                          ))
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* 마감일 */}
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground w-16 flex items-center gap-1.5">
                    <Calendar className="size-3.5" />
                    마감
                  </span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="rounded-md bg-muted px-2 py-0.5 font-medium hover:bg-violet-100 hover:text-violet-700 transition-colors flex items-center gap-1">
                        {format(new Date(task.dueDate), "yyyy.MM.dd (EEE)", { locale: ko })}
                        <Pencil className="size-3 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3" align="start">
                      <Label className="text-xs text-muted-foreground mb-2 block">마감일 변경</Label>
                      <Input
                        type="datetime-local"
                        defaultValue={format(new Date(task.dueDate), "yyyy-MM-dd'T'HH:mm")}
                        onChange={(e) => {
                          if (e.target.value) {
                            updateTask({ dueDate: new Date(e.target.value).toISOString() });
                          }
                        }}
                        className="h-9"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* 우선순위 */}
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground w-16 flex items-center gap-1.5">
                    <Flag className="size-3.5" />
                    우선순위
                  </span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className={cn("rounded-md px-2 py-0.5 text-xs font-medium flex items-center gap-1 hover:ring-2 hover:ring-violet-300 transition-all", priorityColor)}>
                        {priorityLabel}
                        <Pencil className="size-3" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-32 p-1" align="start">
                      <div className="space-y-0.5">
                        {[
                          { value: "HIGH", label: "높음", color: "text-red-600" },
                          { value: "MEDIUM", label: "보통", color: "text-gray-600" },
                          { value: "LOW", label: "낮음", color: "text-slate-500" },
                        ].map((p: any) => (
                          <button
                            key={p.value}
                            onClick={() => updateTask({ priority: p.value })}
                            className={cn(
                              "w-full text-left px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors",
                              task.priority === p.value && "bg-violet-100 text-violet-700",
                              p.color
                            )}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* 지시자 (읽기 전용) */}
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground w-16">지시</span>
                  <span className="rounded-md bg-muted px-2 py-0.5 font-medium">
                    {formatUserName(task.createdBy)}
                  </span>
                </div>
              </div>
            </div>

            {/* 본문: 노션 스타일 블록 에디터 (전체 글 작성) */}
            <div className="border-t border-border/50 px-10 py-4">
              <TaskBodyEditorDynamic
                taskId={task.id}
                initialDescription={task.description}
                onSaved={fetchTask}
              />
            </div>

            {/* 링크 / 첨부 (노션 링크 블록들) */}
            <div
              className="px-10 py-6"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
                <Link2 className="size-4" />
                링크 및 첨부
              </div>
              {task.attachments.length === 0 && !showAddAttach ? (
                <div
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-6 text-center transition-colors",
                    dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:bg-muted/50"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setShowAddAttach(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="size-4" />
                    링크 URL 추가
                  </button>
                  <span className="text-muted-foreground text-xs">또는</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingFiles}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadingFiles ? "업로드 중..." : "파일 선택"}
                  </Button>
                  <p className="text-muted-foreground text-xs">파일을 이 영역에 끌어다 놓아도 추가됩니다.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {task.attachments.map((a: any) => (
                    <a
                      key={a.id}
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
                    >
                      <span className="text-muted-foreground">
                        <FileText className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {a.name || a.url}
                      </span>
                      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                    </a>
                  ))}
                  {showAddAttach ? (
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Select value={attachType} onValueChange={(v) => setAttachType(v as "LINK" | "VIDEO" | "FILE")}>
                          <SelectTrigger className="w-24 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="LINK">링크</SelectItem>
                            <SelectItem value="VIDEO">동영상</SelectItem>
                            <SelectItem value="FILE">파일</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="URL"
                          value={attachUrl}
                          onChange={(e) => setAttachUrl(e.target.value)}
                          className="h-8 flex-1 min-w-[120px] text-sm"
                        />
                        <Input
                          placeholder="이름 (선택)"
                          value={attachName}
                          onChange={(e) => setAttachName(e.target.value)}
                          className="h-8 w-28 text-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => fileInputRef.current?.click()} variant="outline" disabled={uploadingFiles}>
                        {uploadingFiles ? "업로드 중..." : "파일 선택"}
                      </Button>
                      <Button size="sm" onClick={handleAddAttachment} disabled={addingAttach}>
                          추가
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setShowAddAttach(false);
                            setAttachUrl("");
                            setAttachName("");
                          }}
                        >
                          취소
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAddAttach(true)}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    >
                      <Plus className="size-4" />
                      링크 추가
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 댓글 (노션 스타일 스레드) */}
            <div className="border-t px-10 py-6">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-4">
                <MessageSquare className="size-4" />
                댓글 {task.comments.length > 0 && `(${task.comments.length})`}
              </div>
              <ul className="space-y-4">
                {task.comments.map((c: any) => (
                  <li key={c.id} className="flex gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                      {(c.user.name ?? "?").slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">
                        {formatUserName(c.user)}
                        <span className="ml-2">
                          {format(new Date(c.createdAt), "yyyy.MM.dd HH:mm", { locale: ko })}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[15px] leading-relaxed whitespace-pre-wrap">
                        {c.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex gap-2">
                <Textarea
                  placeholder="댓글을 입력하세요..."
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  rows={2}
                  className="min-h-[72px] resize-none text-[15px]"
                />
                <Button
                  onClick={handleAddComment}
                  disabled={addingComment || !commentBody.trim()}
                  className="shrink-0 self-end"
                >
                  {addingComment ? "등록 중..." : "등록"}
                </Button>
              </div>
            </div>
          </div>
        ) : taskId ? (
          <div className="flex min-h-[320px] items-center justify-center px-8">
            <p className="text-muted-foreground text-sm">업무를 불러올 수 없습니다.</p>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
