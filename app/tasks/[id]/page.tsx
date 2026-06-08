"use client";

import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import React, { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
  FolderKanban,
  ChevronDown,
  StretchHorizontal,
  AlignLeft,
  Trash2,
} from "lucide-react";
import { copyTaskToPersonal } from "@/actions/tasks";
import { formatUserName } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  postUploadFile,
  type PostUploadFileOptions,
  UPLOAD_TOAST_DURATION_MS,
  validateUploadFile,
} from "@/lib/upload-client-validate";
import { TaskAttachmentRow } from "@/components/task-attachment-row";
import { TaskBodyEditorWithTabs } from "@/components/task-body-editor-with-tabs";
import { CreateTaskModal } from "@/components/create-task-modal";
import { TaskCreationSource } from "@prisma/client";
import { TaskDetailSkeleton } from "@/components/detail/detail-skeletons";
import { TaskAssigneeAvatars } from "@/components/task-assignee-avatars";
import { Badge } from "@/components/ui/badge";
import { AuthorMetaLine } from "@/components/author-meta-line";
import { workspaceFetchHeaders } from "@/lib/workspace-fetch-headers";
import { taskDetailErrorMessage } from "@/lib/task-detail-error-message";
import { useAutoReadOnEnter } from "@/hooks/use-auto-read-on-enter";
import { ExportDocumentButtons } from "@/components/export-document-buttons";
import { contentToPlainText } from "@/lib/export/plain-from-content";
import { taskDescriptionContentType } from "@/lib/task-body-description";

/** 업무 상세 본문 영역: 전체 뷰포트 너비 vs 좁은 읽기 너비 (localStorage) */
const TASK_PAGE_WIDTH_KEY = "crm-task-page-full-width";

type AssigneeUser = {
  id: string;
  name: string;
  email: string;
  position?: string | null;
  image?: string | null;
};

type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  isCompleted: boolean;
  isCollapsed?: boolean;
  priority: string;
  scope?: "TEAM" | "PERSONAL";
  parentId?: string | null;
  parent?: { id: string; title: string } | null;
  assignees?: AssigneeUser[];
  assignedTo: AssigneeUser | null;
  createdBy: { id: string; name: string; position?: string | null };
  createdById?: string | null;
  updatedAt?: string | null;
  attachments: { id: string; type: string; url: string; name: string | null }[];
  comments: { id: string; body: string; createdAt: string; user: { id: string; name: string; position?: string | null } }[];
  children?: {
    id: string;
    title: string;
    dueDate: string | null;
    isCompleted: boolean;
    status?: string | null;
    priority: string;
    orderIndex: number;
    isCollapsed?: boolean;
    assignees?: AssigneeUser[];
    assignedTo: AssigneeUser | null;
  }[];
  revisions?: {
    id: string;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    createdAt: string;
    user: { id: string; name: string; position?: string | null };
  }[];
  project?: { id: string; name: string; brand: { name: string } } | null;
  projectId?: string | null;
};

class ClientErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err: unknown) {
    console.error(err);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <p className="font-medium">본문 에디터 로딩 중 오류가 발생했습니다.</p>
            <p className="text-muted-foreground mt-1">페이지는 유지되며, 새로고침 후 다시 시도해보세요.</p>
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={() => location.reload()}>
                새로고침
              </Button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const taskId = typeof params.id === "string" ? params.id : null;
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
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
  const [createChildOpen, setCreateChildOpen] = useState(false);
  const [mountEditor, setMountEditor] = useState(false);
  const [deletingTask, setDeletingTask] = useState(false);
  const [workspaceUsers, setWorkspaceUsers] = useState<
    { id: string; name: string; email: string; department: string | null; position?: string | null; image?: string | null }[]
  >([]);
  const [assigneeDraft, setAssigneeDraft] = useState<string[]>([]);
  const [savingAssignees, setSavingAssignees] = useState(false);
  const [pageFullWidth, setPageFullWidth] = useState(true);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadFilesProgressLabel, setUploadFilesProgressLabel] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useAutoReadOnEnter(
    taskId
      ? {
          relatedType: "TASK",
          relatedId: taskId,
          // 백필 전 구 알림도 커버
          linkFallback: [`/tasks/${taskId}`],
        }
      : null,
    `task:${taskId ?? ""}`
  );

  useEffect(() => {
    try {
      setPageFullWidth(localStorage.getItem(TASK_PAGE_WIDTH_KEY) !== "0");
    } catch {
      /* ignore */
    }
  }, []);

  const togglePageWidth = useCallback(() => {
    setPageFullWidth((w) => {
      const next = !w;
      try {
        localStorage.setItem(TASK_PAGE_WIDTH_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const fetchTask = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    setFetchError(null);
    const baseInit = { credentials: "include" as const, headers: workspaceFetchHeaders() };
    try {
      // [PERF-auto] 본문 메타와 댓글 분리 쿼리 병렬 — x-workspace 로 팀/개인 스코프 일치
      const [mainRes, commentsRes] = await Promise.all([
        fetch(`/api/tasks/${taskId}?deferComments=1`, baseInit),
        fetch(`/api/tasks/${taskId}/comments`, baseInit),
      ]);
      if (!mainRes.ok) {
        const msg = await taskDetailErrorMessage(mainRes);
        setFetchError(msg);
        setTask(null);
        if (mainRes.status === 404) {
          router.replace("/tasks");
        }
        return;
      }
      const data = await mainRes.json();
      const commentsJson = commentsRes.ok ? await commentsRes.json() : [];
      const merged = {
        ...data,
        comments: Array.isArray(commentsJson) ? commentsJson : [],
      };
      setTask(merged);
      const ids =
        Array.isArray(merged.assignees) && merged.assignees.length > 0
          ? merged.assignees.map((a: AssigneeUser) => a.id)
          : merged.assignedTo?.id
            ? [merged.assignedTo.id]
            : [];
      setAssigneeDraft(ids);
    } catch {
      setFetchError("네트워크 오류로 프로젝트를 불러오지 못했습니다.");
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [taskId, router]);

  const fetchTaskRef = useRef(fetchTask);
  fetchTaskRef.current = fetchTask;

  useEffect(() => {
    if (taskId) void fetchTaskRef.current();
    else setTask(null);
  }, [taskId]);

  const afterBodyAutoSave = useCallback(() => {}, []);

  useEffect(() => {
    if (!task?.id || !session?.user?.id) return;
    const can =
      session.user.role === "EXECUTIVE" ||
      session.user.role === "ADMIN" ||
      task.createdById === session.user.id ||
      task.assignedTo?.id === session.user.id ||
      (task.assignees?.some((a) => a.id === session.user.id) ?? false);
    if (!can) return;
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : []))
      .then(setWorkspaceUsers)
      .catch(() => setWorkspaceUsers([]));
  }, [task?.id, task?.createdById, task?.assignedTo?.id, session?.user?.id, session?.user?.role]);

  // 본문 에디터: 다음 페인트 직후 마운트(레이아웃 안정) — 예전 800ms 대기 제거로 체감 속도 개선
  useEffect(() => {
    setMountEditor(false);
    if (!taskId) return;
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) setMountEditor(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [taskId]);

  const handleToggleComplete = async () => {
    if (!task) return;
    setTogglingComplete(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: workspaceFetchHeaders({ "Content-Type": "application/json" }),
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

  const uploadAndAddAttachment = useCallback(
    async (file: File, uploadOpts?: PostUploadFileOptions) => {
      if (!taskId) return;
      const data = await postUploadFile(file, uploadOpts);
      const res = await fetch(`/api/tasks/${taskId}/attachments`, {
        method: "POST",
        credentials: "include",
        headers: workspaceFetchHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          type: "FILE",
          url: data.url ?? "",
          name: (data.name || file.name) ?? "",
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error((err as { error?: string }).error ?? "첨부 추가 실패");
      }
    },
    [taskId]
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!taskId || !files?.length) return;
      setUploadingFiles(true);
      setUploadFilesProgressLabel(null);
      const list = Array.from(files);
      const results: { status: "success" | "failed" | "skipped" }[] = [];
      try {
        for (let i = 0; i < list.length; i++) {
          const file = list[i]!;
          setUploadFilesProgressLabel(`${i + 1}/${list.length} 업로드 중…`);
          if (!file.size) {
            results.push({ status: "skipped" });
            continue;
          }
          const v = validateUploadFile(file);
          if (!v.ok) {
            results.push({ status: "failed" });
            continue;
          }
          try {
            await uploadAndAddAttachment(file, {
              onUploadProgress: (loaded, tot) => {
                const pct = tot > 0 ? Math.round((100 * loaded) / tot) : 0;
                setUploadFilesProgressLabel(`${i + 1}/${list.length} · ${pct}%`);
              },
            });
            results.push({ status: "success" });
          } catch {
            results.push({ status: "failed" });
          }
        }
        const ok = results.filter((r) => r.status === "success").length;
        const failed = results.filter((r) => r.status === "failed").length;
        const skipped = results.filter((r) => r.status === "skipped").length;
        if (ok > 0) fetchTask();
        if (failed > 0) {
          toast.warning(`${ok}개 성공, ${failed}개 실패. 실패한 파일은 다시 시도해 주세요.`, {
            duration: UPLOAD_TOAST_DURATION_MS,
          });
        } else if (skipped > 0 && ok > 0) {
          toast.success(`${ok}개 성공 (${skipped}개 빈 파일 제외)`);
        } else if (skipped > 0 && ok === 0) {
          toast.message(`빈 파일 ${skipped}개는 건너뛰었습니다.`);
        } else if (ok > 0) {
          toast.success("첨부가 추가되었습니다.");
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
      } finally {
        setUploadingFiles(false);
        setUploadFilesProgressLabel(null);
      }
    },
    [taskId, uploadAndAddAttachment, fetchTask]
  );

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
        credentials: "include",
        headers: workspaceFetchHeaders({ "Content-Type": "application/json" }),
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

  const handleDeleteTask = async () => {
    if (!task) return;
    if (!confirm("이 프로젝트를 삭제(휴지통 이동)할까요?")) return;
    setDeletingTask(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: workspaceFetchHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "삭제 실패");
      toast.success("삭제되었습니다.");
      router.push("/tasks");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setDeletingTask(false);
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
        credentials: "include",
        headers: workspaceFetchHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ body: commentBody.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "등록 실패");
      }
      const newComment = (await res.json()) as TaskDetail["comments"][number];
      setTask((prev) =>
        prev ? { ...prev, comments: [...prev.comments, newComment] } : null
      );
      toast.success("댓글이 등록되었습니다.");
      setCommentBody("");
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
    return <TaskDetailSkeleton />;
  }

  if (!task) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="max-w-md text-foreground">{fetchError ?? "프로젝트를 불러올 수 없습니다."}</p>
        <Button variant="outline" asChild>
          <Link href="/tasks" prefetch={true}>
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

  const creatorId = task.createdById ?? task.createdBy?.id ?? null;
  const canDeleteTask =
    session?.user?.role === "EXECUTIVE" ||
    session?.user?.role === "ADMIN" ||
    (!!creatorId && creatorId === session?.user?.id);

  const canEditAssignees =
    session?.user?.role === "EXECUTIVE" ||
    session?.user?.role === "ADMIN" ||
    (!!session?.user?.id && creatorId === session.user.id) ||
    (!!session?.user?.id && task.assignedTo?.id === session.user.id) ||
    (!!session?.user?.id && (task.assignees?.some((a) => a.id === session.user.id) ?? false));

  const saveAssignees = async () => {
    if (!taskId || savingAssignees) return;
    setSavingAssignees(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        credentials: "include",
        headers: workspaceFetchHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ assigneeIds: assigneeDraft }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "저장 실패");
      }
      const data = await res.json();
      setTask(data);
      toast.success("담당자를 저장했습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "담당자 저장에 실패했습니다.");
    } finally {
      setSavingAssignees(false);
    }
  };

  const toggleAssigneeDraft = (userId: string) => {
    setAssigneeDraft((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div
        className={cn(
          "mx-auto min-w-0 box-border py-6",
          pageFullWidth
            ? "w-full max-w-full px-4 sm:px-6 lg:px-10 xl:px-12"
            : "max-w-3xl px-4 md:px-8"
        )}
      >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
            <Link href="/tasks" prefetch={true}>
              <ArrowLeft className="mr-2 size-4" />
              Projects 목록
            </Link>
          </Button>
          <div className="flex items-center gap-1">
            {task ? (
              <ExportDocumentButtons
                title={task.title}
                bodyPlain={contentToPlainText(
                  task.description,
                  taskDescriptionContentType(task.description)
                )}
                fileBase={`task_${task.id}`}
                variant="ghost"
                size="sm"
              />
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground shrink-0"
              title={pageFullWidth ? "좁게 보기 (읽기용)" : "페이지 전체 너비로 확장"}
              onClick={togglePageWidth}
            >
              {pageFullWidth ? (
                <>
                  <AlignLeft className="mr-1.5 size-4" />
                  <span className="hidden sm:inline">좁게</span>
                </>
              ) : (
                <>
                  <StretchHorizontal className="mr-1.5 size-4" />
                  <span className="hidden sm:inline">전체 너비</span>
                </>
              )}
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
                      toast.success("개인 프로젝트로 저장되었습니다.");
                    } else {
                      toast.error(result?.error ?? "개인 프로젝트로 저장에 실패했습니다.");
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
            {canDeleteTask && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                disabled={deletingTask}
                onClick={() => void handleDeleteTask()}
              >
                <Trash2 className="size-4" />
                삭제
              </Button>
            )}
          </div>
        </div>
        <p className="text-muted-foreground mb-6 text-sm">
          프로젝트 상세를 보고, 담당·마감일·본문을 수정하거나 Daily Report에 기록할 수 있습니다.
        </p>

        <div className="px-2 pb-10">
          {task.project ? (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
              <FolderKanban className="size-4 text-emerald-700 dark:text-emerald-400" />
              <span className="text-muted-foreground">연결 CRM 프로젝트</span>
              <Link
                href={`/projects/${task.project.id}`}
                prefetch={true}
                className="font-medium text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-300"
              >
                {task.project.brand?.name} / {task.project.name}
              </Link>
            </div>
          ) : null}
          {task.parent ? (
            <div className="mb-4 text-sm text-muted-foreground">
              상위 페이지:{" "}
              <Link href={`/tasks/${task.parent.id}`} prefetch={true} className="text-primary hover:underline">
                {task.parent.title}
              </Link>
            </div>
          ) : null}
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
            <TaskAssigneeAvatars assignees={task.assignees} assignedTo={task.assignedTo} size={26} />
            <span className="rounded-md bg-muted px-2 py-0.5 font-medium">
              {task.assignees && task.assignees.length > 0
                ? task.assignees.map((a) => formatUserName(a)).join(", ")
                : task.assignedTo
                  ? formatUserName(task.assignedTo)
                  : "미지정"}
            </span>
            <span className="text-muted-foreground mx-1">·</span>
            <span className="text-muted-foreground">마감</span>
            <span className="rounded-md bg-muted px-2 py-0.5 font-medium">
              {task.dueDate
                ? format(new Date(task.dueDate), "yyyy.MM.dd (EEE)", { locale: ko })
                : "미정"}
            </span>
            <span className="text-muted-foreground mx-1">·</span>
            <span className="text-muted-foreground">우선순위</span>
            <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", priorityColor)}>{priorityLabel}</span>
            <span className="text-muted-foreground mx-1">·</span>
            <span className="text-muted-foreground">지시</span>
            <span className="rounded-md bg-muted px-2 py-0.5 font-medium">{task.createdBy ? formatUserName(task.createdBy) : "삭제된 사용자"}</span>
          </div>
          <div className="mt-2">
            <AuthorMetaLine
              authorName={task.createdBy?.name}
              editorName={task.revisions?.at(-1)?.user?.name}
              dateIso={task.updatedAt}
            />
          </div>

          {canEditAssignees && workspaceUsers.length > 0 && (
            <div className="mt-4 rounded-lg border bg-muted/15 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">담당자 변경 (복수 선택)</p>
              <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                {workspaceUsers.map((u) => (
                  <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted/50">
                    <Checkbox
                      checked={assigneeDraft.includes(u.id)}
                      onCheckedChange={() => toggleAssigneeDraft(u.id)}
                    />
                    {formatUserName(u)}
                  </label>
                ))}
              </div>
              {assigneeDraft.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {assigneeDraft.map((id) => {
                    const u = workspaceUsers.find((x) => x.id === id);
                    if (!u) return null;
                    return (
                      <Badge key={id} variant="secondary" className="font-normal">
                        {formatUserName(u)}
                      </Badge>
                    );
                  })}
                </div>
              )}
              <Button type="button" size="sm" onClick={() => void saveAssignees()} disabled={savingAssignees}>
                {savingAssignees ? "저장 중..." : "담당자 저장"}
              </Button>
            </div>
          )}

          {/* 본문 — 노션처럼 제목 아래로 이어지는 페이지 본문 */}
          <div className="border-t border-border/40 px-0 py-8">
            <ClientErrorBoundary>
              {mountEditor ? (
                <TaskBodyEditorWithTabs
                  taskId={task.id}
                  initialDescription={task.description}
                  bodyUpdatedAt={task.updatedAt ?? null}
                  onSaved={afterBodyAutoSave}
                />
              ) : (
                <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
                  본문 에디터 로딩 중...
                </div>
              )}
            </ClientErrorBoundary>
          </div>

          <div className="px-2 py-6">
                {/* [PERF-claude-code] 파일 업로드 input — hidden, 버튼으로 트리거 */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept="*/*"
                  onChange={(e: any) => void handleFiles(e.target.files)}
                />
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Link2 className="size-4" />
                  링크 및 첨부
                </div>
                {task.attachments.length === 0 && !showAddAttach ? (
                  <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 px-3 py-5 text-center">
                    <button
                      type="button"
                      onClick={() => setShowAddAttach(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
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
                      {uploadingFiles ? uploadFilesProgressLabel ?? "업로드 중…" : "파일 선택"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {task.attachments.map((a: any) => (
                      <TaskAttachmentRow
                        key={a.id}
                        taskId={task.id}
                        attachment={{ id: a.id, url: a.url, name: a.name }}
                        onRemoved={() => void fetchTask()}
                      />
                    ))}
                    {showAddAttach ? (
                      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                        <div className="flex flex-wrap gap-2">
                          <Select
                            value={attachType}
                            onValueChange={(v: any) => setAttachType(v as "LINK" | "VIDEO" | "FILE")}
                          >
                            <SelectTrigger className="h-8 w-24 text-xs">
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
                            onChange={(e: any) => setAttachUrl(e.target.value)}
                            className="h-8 min-w-[120px] flex-1 text-sm"
                          />
                          <Input
                            placeholder="이름 (선택)"
                            value={attachName}
                            onChange={(e: any) => setAttachName(e.target.value)}
                            className="h-8 w-28 text-sm"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadingFiles}
                          >
                            {uploadingFiles ? uploadFilesProgressLabel ?? "업로드 중…" : "파일 선택"}
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
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAddAttach(true)}
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        >
                          <Plus className="size-4" />
                          링크 추가
                        </button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={uploadingFiles}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          {uploadingFiles ? uploadFilesProgressLabel ?? "업로드 중…" : "파일 선택"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

          {/* 하위 페이지: 본문에서 구분된 하위 글은 별도 페이지로 정리 */}
          <div className="border-t px-2 py-6">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <FileText className="size-4" />
                  하위 페이지
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  본문에서 구분되는 하위 주제는 <strong>하위 페이지 추가</strong>로 별도 페이지로 정리할 수 있습니다.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setCreateChildOpen(true)} className="shrink-0">
                <Plus className="mr-2 size-4" />
                하위 페이지 추가
              </Button>
            </div>
            {(task.children ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">하위 페이지가 없습니다. 위 버튼으로 추가하세요.</p>
            ) : (
              <ul className="space-y-2">
                {(task.children ?? []).map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/tasks/${c.id}`}
                      prefetch={true}
                      className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                    >
                      <span className="font-medium">{c.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.dueDate ? format(new Date(c.dueDate), "M/d", { locale: ko }) : "미정"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <CreateTaskModal
            open={createChildOpen}
            onOpenChange={setCreateChildOpen}
            parentId={task.id}
            orderIndex={(task.children ?? []).length}
            defaultAssigneeIds={
              task.assignees && task.assignees.length > 0
                ? task.assignees.map((a) => a.id)
                : task.assignedTo?.id
                  ? [task.assignedTo.id]
                  : null
            }
            defaultProjectId={task.projectId ?? null}
            creationSourceSubmit={
              task.projectId ? TaskCreationSource.PROJECT : TaskCreationSource.SCHEDULE
            }
            onCreated={() => {
              fetchTask();
              setCreateChildOpen(false);
            }}
          />

          {task.revisions && task.revisions.length > 0 && (
            <div className="border-t px-2 pt-2 pb-2">
              <button
                type="button"
                onClick={() => setRevisionOpen((v) => !v)}
                className="flex w-full items-center gap-1.5 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDown
                  className={cn("size-4 shrink-0 transition-transform duration-200", revisionOpen && "rotate-180")}
                  aria-hidden
                />
                수정 이력 ({task.revisions.length}건)
              </button>
              {revisionOpen && (
                <ul className="space-y-3 border-t border-border/60 py-3">
                  {task.revisions.map((r: any) => {
                    const fieldLabels: Record<string, string> = {
                      title: "제목",
                      description: "설명",
                      status: "상태",
                      dueDate: "마감일",
                      assignedToId: "담당자",
                      assignees: "담당자",
                      priority: "우선순위",
                      isCompleted: "완료 여부",
                      categoryId: "카테고리",
                      parentId: "상위 프로젝트",
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
              )}
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
                    {(c?.user?.name ?? "?").slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      {formatUserName(c?.user)}
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
