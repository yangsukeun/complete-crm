"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
import {
  postUploadFile,
  type PostUploadFileOptions,
  UPLOAD_TOAST_DURATION_MS,
  validateUploadFile,
} from "@/lib/upload-client-validate";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  ListTodo,
  Link2,
  MessageSquare,
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
  FolderKanban,
  Palette,
} from "lucide-react";
import { copyTaskToPersonal } from "@/actions/tasks";
import { formatUserName } from "@/lib/utils";
import { workspaceFetchHeaders } from "@/lib/workspace-fetch-headers";
import { taskDetailErrorMessage } from "@/lib/task-detail-error-message";
import { cn } from "@/lib/utils";
import { getTaskCardAccentColor, PROJECT_TASK_COLORS, taskHasPaletteColor } from "@/lib/project-task-colors";
import { TaskAttachmentRow } from "@/components/task-attachment-row";
import { TaskBodyEditorDynamic } from "@/components/task-body-editor-dynamic";
import { TaskAssigneeAvatars } from "@/components/task-assignee-avatars";

type User = { id: string; name: string; email?: string; department?: string | null; position?: string | null };

type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  isCompleted: boolean;
  priority: string;
  color?: string | null;
  isRecurring?: boolean;
  recurringDays?: string | null;
  recurringMemo?: string | null;
  scope?: "TEAM" | "PERSONAL";
  project?: { id: string; name: string; brand: { name: string } } | null;
  assignees?: { id: string; name: string; email: string; position?: string | null; image?: string | null }[];
  assignedTo: { id: string; name: string; email: string; position?: string | null; image?: string | null } | null;
  createdBy: { id: string; name: string; position?: string | null } | null;
  attachments: { id: string; type: string; url: string; name: string | null }[];
  comments: { id: string; body: string; createdAt: string; user: { id: string; name: string; position?: string | null } }[];
};

export interface TaskDetailContentProps {
  taskId: string;
  onUpdate: () => void;
}

export function TaskDetailContent({ taskId, onUpdate }: TaskDetailContentProps) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const taskRef = useRef<TaskDetail | null>(null);
  taskRef.current = task;
  const taskIdRef = useRef(taskId);
  taskIdRef.current = taskId;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [togglingComplete, setTogglingComplete] = useState(false);

  const [attachType, setAttachType] = useState<"LINK" | "VIDEO" | "FILE">("LINK");
  const [attachUrl, setAttachUrl] = useState("");
  const [attachName, setAttachName] = useState("");
  const [addingAttach, setAddingAttach] = useState(false);
  const [showAddAttach, setShowAddAttach] = useState(false);

  const [commentBody, setCommentBody] = useState("");
  const [addingComment, setAddingComment] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadFilesProgressLabel, setUploadFilesProgressLabel] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [assigneePickerIds, setAssigneePickerIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [copyingToPersonal, setCopyingToPersonal] = useState(false);
  const [detailTab, setDetailTab] = useState<"detail" | "audit">("detail");
  const [auditRows, setAuditRows] = useState<
    { id: string; field: string; oldValue: string | null; newValue: string | null; createdAt: string; actor: { id: string; name: string | null } }[]
  >([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [editIsRecurring, setEditIsRecurring] = useState(false);
  const [editRecurringFreq, setEditRecurringFreq] = useState<"DAILY" | "WEEKLY" | "MONTHLY" | "HOURLY">("WEEKLY");
  const [editRecurringInterval, setEditRecurringInterval] = useState<number>(1);
  const [editRecurringDays, setEditRecurringDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [editRecurringMonthDay, setEditRecurringMonthDay] = useState<number>(1);
  const [editRecurringHourInterval, setEditRecurringHourInterval] = useState<number>(24);
  const [editRecurringMemo, setEditRecurringMemo] = useState("");

  useEffect(() => {
    setLoadingUsers(true);
    fetch("/api/users")
      .then((res) => (res.ok ? res.json() : []))
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false));
  }, [taskId]);

  const updateTask = useCallback(async (data: Record<string, unknown>) => {
    if (!taskRef.current) return;
    const tid = taskIdRef.current;
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${tid}`, {
        method: "PATCH",
        credentials: "include",
        headers: workspaceFetchHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const msg =
          typeof (errJson as { message?: unknown }).message === "string"
            ? (errJson as { message: string }).message
            : typeof (errJson as { error?: unknown }).error === "string"
              ? (errJson as { error: string }).error
              : "수정 실패";
        throw new Error(msg);
      }
      const updated = await res.json();
      if (taskIdRef.current !== tid) return;
      setTask((prev) => (prev ? { ...prev, ...updated } : null));
      toast.success("수정되었습니다.");
      onUpdateRef.current();
    } catch {
      toast.error("수정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }, []);

  const handleSaveTitle = useCallback(() => {
    if (editTitle.trim() && editTitle.trim() !== task?.title) {
      updateTask({ title: editTitle.trim() });
    }
    setIsEditingTitle(false);
  }, [editTitle, task?.title, updateTask]);

  const loadDetailRef = useRef<(opts: { soft: boolean }) => Promise<void>>(async () => {});
  loadDetailRef.current = async (opts: { soft: boolean }) => {
    const tid = taskIdRef.current;
    const soft = opts.soft === true;
    if (!soft) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const baseInit: RequestInit = {
        credentials: "include",
        headers: workspaceFetchHeaders(),
      };
      const [mainRes, commentsRes] = await Promise.all([
        fetch(`/api/tasks/${tid}?deferComments=1`, baseInit),
        fetch(`/api/tasks/${tid}/comments`, baseInit),
      ]);
      if (!mainRes.ok) {
        const msg = await taskDetailErrorMessage(mainRes);
        throw new Error(msg);
      }
      const data = await mainRes.json();
      const commentsJson = commentsRes.ok ? await commentsRes.json() : [];
      if (taskIdRef.current !== tid) return;
      setLoadError(null);
      setTask({
        ...data,
        comments: Array.isArray(commentsJson) ? commentsJson : [],
      });
    } catch (e) {
      if (!soft && taskIdRef.current === tid) {
        setTask(null);
        setLoadError(e instanceof Error ? e.message : "프로젝트를 불러올 수 없습니다.");
      }
    } finally {
      if (!soft && taskIdRef.current === tid) setLoading(false);
    }
  };

  useEffect(() => {
    void loadDetailRef.current({ soft: false });
  }, [taskId]);

  const refreshTaskAfterMutation = useCallback(() => {
    void loadDetailRef.current({ soft: true });
  }, []);

  /** 본문 자동저장(PATCH) 직후 서버 재조회하지 않음 — 에디터·루프 방지 */
  const afterBodyAutoSave = useCallback(() => {}, []);

  const assigneeIdsKey =
    task == null || task.id !== taskId
      ? ""
      : [
          ...(task.assignees?.map((a) => a.id) ?? []),
          task.assignedTo?.id ?? "",
        ]
          .filter(Boolean)
          .sort()
          .join("|");

  useEffect(() => {
    const t = taskRef.current;
    const tid = taskIdRef.current;
    if (!t || t.id !== tid) {
      setAssigneePickerIds([]);
      return;
    }
    const ids =
      t.assignees && t.assignees.length > 0
        ? t.assignees.map((a) => a.id)
        : t.assignedTo?.id
          ? [t.assignedTo.id]
          : [];
    setAssigneePickerIds((prev) =>
      prev.length === ids.length && ids.every((id, i) => prev[i] === id) ? prev : ids
    );
  }, [assigneeIdsKey, taskId]);

  useEffect(() => {
    if (!task) {
      setEditIsRecurring(false);
      setEditRecurringFreq("WEEKLY");
      setEditRecurringInterval(1);
      setEditRecurringDays([1, 2, 3, 4, 5]);
      setEditRecurringMonthDay(1);
      setEditRecurringHourInterval(24);
      setEditRecurringMemo("");
      return;
    }
    setEditIsRecurring(Boolean(task.isRecurring));
    // recurringRule 우선, 없으면 recurringDays(레거시)로 폴백
    const rr = (task as any).recurringRule as any;
    if (rr && typeof rr === "object") {
      const freq = String(rr.freq || "WEEKLY").toUpperCase();
      if (freq === "DAILY" || freq === "WEEKLY" || freq === "MONTHLY" || freq === "HOURLY") {
        setEditRecurringFreq(freq);
      } else {
        setEditRecurringFreq("WEEKLY");
      }
      const interval = Math.max(1, Math.floor(Number(rr.interval || 1) || 1));
      if (freq === "HOURLY") setEditRecurringHourInterval(interval);
      else setEditRecurringInterval(interval);
      if (freq === "MONTHLY") {
        const md = Math.min(31, Math.max(1, Math.floor(Number(rr.monthDay || 1) || 1)));
        setEditRecurringMonthDay(md);
      }
      const w: number[] = Array.isArray(rr.weekdays)
        ? rr.weekdays.map((n: any) => Number(n)).filter((n: number) => n >= 1 && n <= 7)
        : [];
      if (freq === "WEEKLY" && w.length > 0) {
        setEditRecurringDays([...new Set(w)].sort((a: number, b: number) => a - b));
      }
    }
    try {
      const raw = task.recurringDays ? JSON.parse(task.recurringDays) : null;
      const arr = Array.isArray(raw) ? raw.map((n: unknown) => Number(n)).filter((n) => n >= 1 && n <= 7) : [];
      setEditRecurringDays(arr.length > 0 ? [...new Set(arr)].sort((a, b) => a - b) : [1, 2, 3, 4, 5]);
    } catch {
      setEditRecurringDays([1, 2, 3, 4, 5]);
    }
    setEditRecurringMemo(task.recurringMemo ?? "");
  }, [task?.id, task?.isRecurring, (task as any)?.recurringRule, task?.recurringDays, task?.recurringMemo]);

  const toggleRecurringDay = (day: number) => {
    setEditRecurringDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  };

  const saveRecurringSettings = () => {
    if (!editIsRecurring) {
      void updateTask({
        isRecurring: false,
      });
      return;
    }
    if (!taskRef.current?.dueDate) {
      toast.error("반복 업무를 쓰려면 먼저 마감일을 지정해 주세요.");
      return;
    }
    void updateTask({
      isRecurring: true,
      recurringDays: editRecurringFreq === "WEEKLY" ? JSON.stringify(editRecurringDays.length > 0 ? editRecurringDays : [1, 2, 3, 4, 5]) : null,
      recurringRule: {
        freq: editRecurringFreq,
        interval:
          editRecurringFreq === "HOURLY"
            ? Math.max(1, Math.floor(editRecurringHourInterval || 1))
            : Math.max(1, Math.floor(editRecurringInterval || 1)),
        ...(editRecurringFreq === "WEEKLY" ? { weekdays: editRecurringDays } : {}),
        ...(editRecurringFreq === "MONTHLY" ? { monthDay: Math.min(31, Math.max(1, editRecurringMonthDay || 1)) } : {}),
      },
      recurringMemo: editRecurringMemo.trim() || null,
    });
  };

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
      setTask((prev) => (prev ? { ...prev, isCompleted: !prev.isCompleted } : null));
      onUpdateRef.current();
    } catch {
      toast.error("완료 상태 변경에 실패했습니다.");
    } finally {
      setTogglingComplete(false);
    }
  };

  const handleAddAttachment = async () => {
    if (!attachUrl.trim()) {
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
      refreshTaskAfterMutation();
      onUpdateRef.current();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "첨부 추가에 실패했습니다.");
    } finally {
      setAddingAttach(false);
    }
  };

  const uploadAndAddAttachment = useCallback(
    async (file: File, uploadOpts?: PostUploadFileOptions) => {
      const data = await postUploadFile(file, uploadOpts);
      const attachRes = await fetch(`/api/tasks/${taskId}/attachments`, {
        method: "POST",
        credentials: "include",
        headers: workspaceFetchHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          type: "FILE",
          url: data.url ?? "",
          name: (data.name || file?.name) ?? "",
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
        if (ok > 0) {
          refreshTaskAfterMutation();
          onUpdateRef.current();
        }
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
    [taskId, uploadAndAddAttachment, refreshTaskAfterMutation]
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

  useEffect(() => {
    if (detailTab !== "audit" || !taskId) return;
    let cancelled = false;
    (async () => {
      setAuditLoading(true);
      try {
        const res = await fetch(`/api/tasks/${taskId}/audit`, {
          credentials: "include",
          headers: workspaceFetchHeaders(),
        });
        const j = await res.json();
        if (!cancelled && res.ok && Array.isArray(j)) setAuditRows(j);
        else if (!cancelled && !res.ok) setAuditRows([]);
      } catch {
        if (!cancelled) setAuditRows([]);
      } finally {
        if (!cancelled) setAuditLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailTab, taskId]);

  const handleAddComment = async () => {
    if (!commentBody.trim()) {
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
      const newComment = await res.json();
      setTask((prev) => (prev ? { ...prev, comments: [...prev.comments, newComment] } : null));
      toast.success("댓글이 등록되었습니다.");
      setCommentBody("");
      onUpdateRef.current();
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

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center px-8">
        <p className="text-muted-foreground text-sm">불러오는 중...</p>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 px-8 text-center">
        <p className="text-muted-foreground max-w-md text-sm">{loadError ?? "프로젝트를 불러올 수 없습니다."}</p>
      </div>
    );
  }

  return (
    <div className="max-h-[90vh] overflow-y-auto">
      <div
        className="h-1 shrink-0"
        style={{ background: getTaskCardAccentColor(task.color) }}
        aria-hidden
      />
      <div className="flex gap-1 border-b border-border px-4 pt-2">
        <Button
          type="button"
          variant={detailTab === "detail" ? "secondary" : "ghost"}
          size="sm"
          className="rounded-b-none"
          onClick={() => setDetailTab("detail")}
        >
          상세
        </Button>
        <Button
          type="button"
          variant={detailTab === "audit" ? "secondary" : "ghost"}
          size="sm"
          className="rounded-b-none"
          onClick={() => setDetailTab("audit")}
        >
          변경 이력
        </Button>
      </div>
      {detailTab === "audit" ? (
        <div className="px-6 py-8">
          {auditLoading ? (
            <p className="text-muted-foreground text-sm">불러오는 중...</p>
          ) : auditRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">기록된 변경이 없습니다.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {auditRows.map((r) => (
                <li key={r.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                    <span>{format(new Date(r.createdAt), "yyyy.MM.dd HH:mm", { locale: ko })}</span>
                    <span>·</span>
                    <span>{formatUserName({ name: (r.actor.name ?? "").trim() || "이름 없음" })}</span>
                    <span>·</span>
                    <span className="font-medium text-foreground">{r.field}</span>
                  </div>
                  <p className="mt-1 break-all">
                    <span className="text-red-700/90">{r.oldValue ?? "—"}</span>
                    <span className="text-muted-foreground mx-1">→</span>
                    <span className="text-emerald-800/90">{r.newValue ?? "—"}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
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
                const result = (await copyTaskToPersonal(task.id)) as { ok?: boolean; error?: string };
                if (result.ok) {
                  toast.success("개인 프로젝트로 저장되었습니다.");
                  onUpdateRef.current();
                } else {
                  toast.error(result.error ?? "실패");
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
      <div className="px-10 pt-8 pb-2">
        {task.project ? (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <FolderKanban className="size-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
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
                  className="h-auto py-1 text-2xl font-semibold"
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
                  "group flex cursor-pointer items-center gap-2 rounded px-1 -mx-1 text-2xl font-semibold tracking-tight transition-colors hover:bg-muted/50 md:text-3xl",
                  task.isCompleted && "text-muted-foreground line-through"
                )}
                onClick={() => {
                  setEditTitle(task.title ?? "");
                  setIsEditingTitle(true);
                }}
                title="클릭하여 제목 수정"
              >
                {task.title}
                <Pencil className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </h1>
            )}
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground flex w-16 items-center gap-1.5">
              <User className="size-3.5" />
              담당
            </span>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex max-w-[min(100%,280px)] items-center gap-2 rounded-md bg-muted px-2 py-0.5 font-medium transition-colors hover:bg-violet-100 hover:text-violet-700"
                >
                  <TaskAssigneeAvatars assignees={task.assignees} assignedTo={task.assignedTo} size={22} />
                  <span className="truncate">
                    {task.assignees && task.assignees.length > 0
                      ? task.assignees.map((a) => formatUserName(a)).join(", ")
                      : task.assignedTo
                        ? formatUserName(task.assignedTo)
                        : "미지정"}
                  </span>
                  <Pencil className="size-3 shrink-0 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="start">
                <p className="text-muted-foreground mb-2 text-xs">복수 선택 후 적용</p>
                <div className="max-h-[220px] space-y-1 overflow-y-auto">
                  {loadingUsers ? (
                    <p className="text-muted-foreground p-2 text-xs">불러오는 중...</p>
                  ) : (
                    users.map((u) => (
                      <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                        <Checkbox
                          checked={assigneePickerIds.includes(u.id)}
                          onCheckedChange={() =>
                            setAssigneePickerIds((prev) =>
                              prev.includes(u.id) ? prev.filter((x) => x !== u.id) : [...prev, u.id]
                            )
                          }
                        />
                        {formatUserName(u)}
                      </label>
                    ))
                  )}
                </div>
                <Button type="button" size="sm" className="mt-3 w-full" disabled={saving} onClick={() => updateTask({ assigneeIds: assigneePickerIds })}>
                  적용
                </Button>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground flex w-16 items-center gap-1.5">
              <Calendar className="size-3.5" />
              마감
            </span>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-medium transition-colors hover:bg-violet-100 hover:text-violet-700"
                >
                  {task.dueDate
                    ? format(new Date(task.dueDate), "yyyy.MM.dd (EEE)", { locale: ko })
                    : "미정"}
                  <Pencil className="size-3 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto space-y-2 p-3" align="start">
                <Label className="text-muted-foreground block text-xs">마감일 변경</Label>
                <Input
                  key={task.dueDate ?? "none"}
                  type="datetime-local"
                  defaultValue={
                    task.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd'T'HH:mm") : ""
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    const nextMs = new Date(v).getTime();
                    const curMs = task.dueDate ? new Date(task.dueDate).getTime() : NaN;
                    if (Number.isFinite(nextMs) && Number.isFinite(curMs) && nextMs === curMs) return;
                    updateTask({ dueDate: new Date(v).toISOString() });
                  }}
                  className="h-9"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={saving || !task.dueDate}
                  onClick={() => updateTask({ dueDate: null })}
                >
                  마감일 없음
                </Button>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground flex w-16 items-center gap-1.5">
              <Flag className="size-3.5" />
              우선순위
            </span>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn("flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-all hover:ring-2 hover:ring-violet-300", priorityColor)}
                >
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
                  ].map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => updateTask({ priority: p.value })}
                      className={cn(
                        "w-full rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
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

          <div className="flex items-start gap-3 text-sm">
            <span className="text-muted-foreground flex w-16 shrink-0 gap-1.5 pt-0.5">
              <Palette className="size-3.5" />
              색상
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                title="기본(우선순위 막대만)"
                onClick={() => updateTask({ color: null })}
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border-2 text-[10px] text-muted-foreground",
                  !taskHasPaletteColor(task.color) ? "border-violet-500" : "border-muted hover:bg-muted"
                )}
              >
                —
              </button>
              {PROJECT_TASK_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => updateTask({ color: c.value })}
                  className={cn(
                    "size-7 shrink-0 rounded-full border-2 transition-transform",
                    task.color === c.value ? "scale-110 border-gray-800" : "border-transparent hover:scale-105"
                  )}
                  style={{ background: c.value }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-3 text-sm">
            <span className="text-muted-foreground w-16 shrink-0 pt-0.5">반복</span>
            <div className="min-w-0 flex-1 space-y-2">
              <button
                type="button"
                className="rounded-md bg-muted px-2 py-0.5 font-medium transition-colors hover:bg-violet-100 hover:text-violet-700"
                onClick={() => setRecurringOpen((o) => !o)}
              >
                {task.isRecurring ? `설정됨 (${editRecurringDays.length}일)` : "없음"}
                <Pencil className="ml-1 inline-block size-3 text-muted-foreground" />
              </button>
              {recurringOpen && (
                <div className="space-y-3 rounded-lg border bg-card p-3">
                  <label className="flex cursor-pointer items-center gap-2">
                    <Checkbox checked={editIsRecurring} onCheckedChange={(c) => setEditIsRecurring(c === true)} />
                    <span>반복 업무로 설정</span>
                  </label>
                  {editIsRecurring && (
                    <>
                      <div className="grid gap-2">
                        <Label className="text-xs text-muted-foreground">반복 단위</Label>
                        <Select value={editRecurringFreq} onValueChange={(v: any) => setEditRecurringFreq(v)}>
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="HOURLY">시간 단위</SelectItem>
                            <SelectItem value="DAILY">일 단위</SelectItem>
                            <SelectItem value="WEEKLY">주 단위</SelectItem>
                            <SelectItem value="MONTHLY">월 단위</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {editRecurringFreq === "HOURLY" ? (
                        <div className="grid gap-2">
                          <Label className="text-xs text-muted-foreground">간격(시간)</Label>
                          <Input
                            className="mt-1 h-9 text-sm"
                            type="number"
                            min={1}
                            value={editRecurringHourInterval}
                            onChange={(e: any) =>
                              setEditRecurringHourInterval(Math.max(1, parseInt(e.target.value || "1", 10) || 1))
                            }
                          />
                        </div>
                      ) : (
                        <div className="grid gap-2">
                          <Label className="text-xs text-muted-foreground">간격</Label>
                          <Input
                            className="mt-1 h-9 text-sm"
                            type="number"
                            min={1}
                            value={editRecurringInterval}
                            onChange={(e: any) =>
                              setEditRecurringInterval(Math.max(1, parseInt(e.target.value || "1", 10) || 1))
                            }
                          />
                        </div>
                      )}

                      <div>
                        {editRecurringFreq === "WEEKLY" && (
                          <>
                            <p className="text-muted-foreground mb-1.5 text-xs">반복 요일</p>
                            <div className="flex flex-wrap gap-1.5">
                              {["월", "화", "수", "목", "금", "토", "일"].map((day, i) => {
                                const n = i + 1;
                                const on = editRecurringDays.includes(n);
                                return (
                                  <button
                                    key={n}
                                    type="button"
                                    onClick={() => toggleRecurringDay(n)}
                                    className={cn(
                                      "flex size-8 items-center justify-center rounded-full border text-xs transition-colors",
                                      on
                                        ? "border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-700 dark:bg-violet-950/60 dark:text-violet-200"
                                        : "border-border text-muted-foreground hover:bg-muted/60"
                                    )}
                                  >
                                    {day}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                        {editRecurringFreq === "MONTHLY" && (
                          <div className="grid gap-2">
                            <Label className="text-xs text-muted-foreground">매월 N일</Label>
                            <Input
                              className="mt-1 h-9 text-sm"
                              type="number"
                              min={1}
                              max={31}
                              value={editRecurringMonthDay}
                              onChange={(e: any) =>
                                setEditRecurringMonthDay(
                                  Math.min(31, Math.max(1, parseInt(e.target.value || "1", 10) || 1))
                                )
                              }
                            />
                          </div>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">메모 (선택)</Label>
                        <Input
                          className="mt-1 h-9 text-sm"
                          value={editRecurringMemo}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditRecurringMemo(e.target.value)}
                          placeholder="반복 업무 설명"
                        />
                      </div>
                      <p className="text-muted-foreground text-[11px]">
                        시간은 <strong>마감일</strong> 시간(YYYY-MM-DD HH:mm)을 기준으로 반복됩니다.
                      </p>
                    </>
                  )}
                  <Button type="button" size="sm" disabled={saving} onClick={saveRecurringSettings}>
                    반복 설정 저장
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground w-16">지시</span>
            <span className="rounded-md bg-muted px-2 py-0.5 font-medium">
              {task.createdBy ? formatUserName(task.createdBy) : "삭제된 사용자"}
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-border/50 px-10 py-4">
        <TaskBodyEditorDynamic
          taskId={task.id}
          initialDescription={task.description}
          onSaved={afterBodyAutoSave}
        />
      </div>

      <div className="px-10 py-6" onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept="*/*"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="text-muted-foreground mb-3 flex items-center gap-2 text-sm font-medium">
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
            <Button type="button" variant="outline" size="sm" disabled={uploadingFiles} onClick={() => fileInputRef.current?.click()}>
              {uploadingFiles ? uploadFilesProgressLabel ?? "업로드 중…" : "파일 선택"}
            </Button>
            <p className="text-muted-foreground text-xs">파일을 이 영역에 끌어다 놓아도 추가됩니다.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {task.attachments.map((a) => (
              <TaskAttachmentRow
                key={a.id}
                taskId={task.id}
                attachment={{ id: a.id, url: a.url, name: a.name }}
                onRemoved={() => {
                  refreshTaskAfterMutation();
                  onUpdateRef.current();
                }}
              />
            ))}
            {showAddAttach ? (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex flex-wrap gap-2">
                  <Select value={attachType} onValueChange={(v) => setAttachType(v as "LINK" | "VIDEO" | "FILE")}>
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
                    onChange={(e) => setAttachUrl(e.target.value)}
                    className="h-8 min-w-[120px] flex-1 text-sm"
                  />
                  <Input placeholder="이름 (선택)" value={attachName} onChange={(e) => setAttachName(e.target.value)} className="h-8 w-28 text-sm" />
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => fileInputRef.current?.click()} variant="outline" disabled={uploadingFiles}>
                    {uploadingFiles ? uploadFilesProgressLabel ?? "업로드 중…" : "파일 선택"}
                  </Button>
                  <Button type="button" size="sm" onClick={handleAddAttachment} disabled={addingAttach}>
                    추가
                  </Button>
                  <Button
                    type="button"
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

      <div className="border-t px-10 py-6">
        <div className="text-muted-foreground mb-4 flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="size-4" />
          댓글 {task.comments.length > 0 && `(${task.comments.length})`}
        </div>
        <ul className="space-y-4">
          {task.comments.map((c, index) => (
            <li key={c?.id ?? index} className="flex gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                {(c?.user?.name ?? "?").slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  {formatUserName(c?.user)}
                  <span className="ml-2">{format(new Date(c?.createdAt ?? 0), "yyyy.MM.dd HH:mm", { locale: ko })}</span>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-[15px] leading-relaxed">{c?.body ?? ""}</p>
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
          <Button onClick={handleAddComment} disabled={addingComment || !commentBody.trim()} className="shrink-0 self-end">
            {addingComment ? "등록 중..." : "등록"}
          </Button>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
