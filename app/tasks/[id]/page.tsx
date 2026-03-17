"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ArrowLeft,
  Download,
  History,
} from "lucide-react";
import { copyTaskToPersonal } from "@/actions/tasks";
import { formatUserName } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { FilePreviewDialog } from "@/components/file-preview-dialog";
import { TaskBodyEditorDynamic } from "@/components/task-body-editor-dynamic";

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
  revisions?: {
    id: string;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    createdAt: string;
    user: { id: string; name: string; position?: string | null };
  }[];
};

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = typeof params.id === "string" ? params.id : null;
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(!!taskId);
  const [togglingComplete, setTogglingComplete] = useState(false);
  const [attachType, setAttachType] = useState<"LINK" | "VIDEO" | "FILE">("LINK");
  const [attachUrl, setAttachUrl] = useState("");
  const [attachName, setAttachName] = useState("");
  const [addingAttach, setAddingAttach] = useState(false);
  const [showAddAttach, setShowAddAttach] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [addingComment, setAddingComment] = useState(false);
  const [copyingToPersonal, setCopyingToPersonal] = useState(false);

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
      setTask((prev: any) => (prev ? { ...prev, isCompleted: !prev.isCompleted } : null));
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
        body: JSON.stringify({ type: attachType, url: attachUrl.trim(), name: attachName.trim() || undefined }),
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "첨부 추가에 실패했습니다.");
    } finally {
      setAddingAttach(false);
    }
  };

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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "댓글 등록에 실패했습니다.");
    } finally {
      setAddingComment(false);
    }
  };

  if (!taskId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">잘못된 경로입니다.</p>
      </div>
    );
  }

  if (loading && !task) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground text-sm">불러오는 중...</p>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">업무를 불러올 수 없습니다.</p>
        <Button variant="outline" asChild>
          <Link href="/tasks">
            <ArrowLeft className="mr-2 size-4" />
            목록으로
          </Link>
        </Button>
      </div>
    );
  }

  const priorityLabel = task.priority === "HIGH" ? "높음" : task.priority === "LOW" ? "낮음" : "보통";
  const priorityColor =
    task.priority === "HIGH"
      ? "bg-red-500/10 text-red-700 dark:text-red-400"
      : task.priority === "LOW"
        ? "bg-slate-500/10 text-slate-600 dark:text-slate-400"
        : "bg-muted text-muted-foreground";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
        <div className="mb-6 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
            <Link href="/tasks">
              <ArrowLeft className="mr-2 size-4" />
              목록으로
            </Link>
          </Button>
          {task.scope === "TEAM" && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={copyingToPersonal}
              onClick={async () => {
                setCopyingToPersonal(true);
                try {
                  const result = (await copyTaskToPersonal(task.id)) as any;
                  if (result?.ok) {
                    toast.success("개인 업무로 저장되었습니다.");
                  } else {
                    toast.error(result?.error ?? "개인 업무로 저장에 실패했습니다.");
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
        </div>
        <p className="text-muted-foreground mb-6 text-sm">
          업무 상세를 보고, 담당·마감일·본문을 수정하거나 업무일지에 기록할 수 있습니다.
        </p>

        <div className="px-2 pb-10">
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
              <h1
                className={cn(
                  "text-2xl font-semibold tracking-tight md:text-3xl",
                  task.isCompleted && "text-muted-foreground line-through"
                )}
              >
                {task.title}
              </h1>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">담당</span>
            <span className="rounded-md bg-muted px-2 py-0.5 font-medium">{task.assignedTo ? formatUserName(task.assignedTo) : "미지정"}</span>
            <span className="text-muted-foreground mx-1">·</span>
            <span className="text-muted-foreground">마감</span>
            <span className="rounded-md bg-muted px-2 py-0.5 font-medium">
              {format(new Date(task.dueDate), "yyyy.MM.dd (EEE)", { locale: ko })}
            </span>
            <span className="text-muted-foreground mx-1">·</span>
            <span className="text-muted-foreground">우선순위</span>
            <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", priorityColor)}>{priorityLabel}</span>
            <span className="text-muted-foreground mx-1">·</span>
            <span className="text-muted-foreground">지시</span>
            <span className="rounded-md bg-muted px-2 py-0.5 font-medium">{task.createdBy ? formatUserName(task.createdBy) : "삭제된 사용자"}</span>
          </div>

          <div className="border-t border-border/50 px-2 py-6">
            <TaskBodyEditorDynamic
              taskId={task.id}
              initialDescription={task.description}
              onSaved={fetchTask}
            />
          </div>

          <div className="px-2 py-6">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Link2 className="size-4" />
              링크 및 첨부
            </div>
            {task.attachments.length === 0 && !showAddAttach ? (
              <button
                type="button"
                onClick={() => setShowAddAttach(true)}
                className="flex w-full items-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <Plus className="size-4" />
                링크 추가
              </button>
            ) : (
              <div className="space-y-2">
                {task.attachments.map((a: any) => (
                  <div
                    key={a.id}
                    className="flex items-center"
                  >
                    <FilePreviewDialog
                      url={a.url}
                      name={a.name}
                      triggerVariant="ghost"
                      triggerClassName="w-full justify-start rounded-lg border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
                    />
                  </div>
                ))}
                {showAddAttach ? (
                  <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                    <div className="flex flex-wrap gap-2">
                      <Select value={attachType} onValueChange={(v: any) => setAttachType(v as "LINK" | "VIDEO" | "FILE")}>
                        <SelectTrigger className="h-8 w-24 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LINK">링크</SelectItem>
                          <SelectItem value="VIDEO">동영상</SelectItem>
                          <SelectItem value="FILE">파일</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input placeholder="URL" value={attachUrl} onChange={(e: any) => setAttachUrl(e.target.value)} className="h-8 min-w-[120px] flex-1 text-sm" />
                      <Input placeholder="이름 (선택)" value={attachName} onChange={(e: any) => setAttachName(e.target.value)} className="h-8 w-28 text-sm" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleAddAttachment} disabled={addingAttach}>추가</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setShowAddAttach(false); setAttachUrl(""); setAttachName(""); }}>취소</Button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowAddAttach(true)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground">
                    <Plus className="size-4" />
                    링크 추가
                  </button>
                )}
              </div>
            )}
          </div>

          {task.revisions && task.revisions.length > 0 && (
            <div className="border-t px-2 py-6">
              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <History className="size-4" />
                수정 이력 (누가, 무엇을, 언제)
              </div>
              <ul className="space-y-3">
                {task.revisions.map((r: any) => {
                  const fieldLabels: Record<string, string> = {
                    title: "제목",
                    description: "설명",
                    status: "상태",
                    dueDate: "마감일",
                    assignedToId: "담당자",
                    priority: "우선순위",
                    isCompleted: "완료 여부",
                    categoryId: "카테고리",
                    parentId: "상위 업무",
                  };
                  const label = fieldLabels[r.field] ?? r.field;
                  const oldVal = r.oldValue ?? "(비어 있음)";
                  const newVal = r.newValue ?? "(비어 있음)";
                  return (
                    <li key={r.id} className="flex gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                        {(r.user?.name ?? "?").slice(0, 1)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">
                          {formatUserName(r.user)}
                          <span className="ml-2">{format(new Date(r.createdAt), "yyyy.MM.dd HH:mm", { locale: ko })}</span>
                        </p>
                        <p className="mt-1 font-medium text-foreground">
                          {label}: <span className="text-muted-foreground line-through">{oldVal}</span> → <span className="font-medium">{newVal}</span>
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="border-t px-2 py-6">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-muted-foreground">
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
                      <span className="ml-2">{format(new Date(c.createdAt), "yyyy.MM.dd HH:mm", { locale: ko })}</span>
                    </p>
                    <p className="mt-0.5 text-[15px] leading-relaxed whitespace-pre-wrap">{c.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2">
              <Textarea placeholder="댓글을 입력하세요..." value={commentBody} onChange={(e: any) => setCommentBody(e.target.value)} rows={2} className="min-h-[72px] resize-none text-[15px]" />
              <Button onClick={handleAddComment} disabled={addingComment || !commentBody.trim()} className="shrink-0 self-end">
                {addingComment ? "등록 중..." : "등록"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
