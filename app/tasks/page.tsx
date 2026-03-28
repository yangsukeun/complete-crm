"use client";

import "./components/mindmap-toolbar.css";
import React, {
  Component,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { TaskAssigneeAvatars } from "@/components/task-assignee-avatars";
import { PageHeadline } from "@/components/page-headline";
import { toast } from "sonner";
import { Plus, Filter, GitBranch, FileText, List as ListIcon, Trash2 } from "lucide-react";
import { formatUserName } from "@/lib/utils";
import {
  addDays,
  differenceInCalendarDays,
  endOfDay,
  endOfWeek,
  format,
  isBefore,
  isWithinInterval,
  startOfDay,
} from "date-fns";
import { ko } from "date-fns/locale";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const TaskTreeView = dynamic(
  () => import("./components/view-tree").then((m) => m.TaskTreeView),
  {
    ssr: false,
    loading: () => (
      <p className="text-muted-foreground py-12 text-center text-sm">
        Mindmap 불러오는 중...
      </p>
    ),
  }
);

const WorkLogTab = dynamic(
  () => import("./components/work-log-tab").then((m) => m.WorkLogTab),
  {
    ssr: false,
    loading: () => (
      <p className="text-muted-foreground py-12 text-center text-sm">
        Daily Report 불러오는 중...
      </p>
    ),
  }
);

const CreateTaskModal = dynamic(
  () => import("@/components/create-task-modal").then((m) => m.CreateTaskModal),
  { ssr: false }
);

const STATUS_LIST = [
  { value: "TODO", label: "준비중" },
  { value: "IN_PROGRESS", label: "진행중" },
  { value: "DONE", label: "완료" },
] as const;

type TaskStatus = (typeof STATUS_LIST)[number]["value"];

const COLUMN_STORAGE_KEY = "tasks-board-visible-columns";
/** 목록·마인드맵 공통: 대표/관리자의 팀 전체 혼탕 표시 구분용 */
const PROJECT_SCOPE_STORAGE_KEY = "tasks-project-scope-filter";
type ProjectScopeFilter = "all" | "mine" | "shared";

type ColumnVisibility = Record<TaskStatus, boolean>;
const DEFAULT_COLUMN_VISIBILITY: ColumnVisibility = {
  TODO: true,
  IN_PROGRESS: true,
  DONE: false,
};

function loadColumnVisibility(): ColumnVisibility {
  if (typeof window === "undefined") return DEFAULT_COLUMN_VISIBILITY;
  try {
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) return DEFAULT_COLUMN_VISIBILITY;
    const p = JSON.parse(raw) as Partial<ColumnVisibility>;
    return {
      TODO: typeof p.TODO === "boolean" ? p.TODO : DEFAULT_COLUMN_VISIBILITY.TODO,
      IN_PROGRESS:
        typeof p.IN_PROGRESS === "boolean" ? p.IN_PROGRESS : DEFAULT_COLUMN_VISIBILITY.IN_PROGRESS,
      DONE: typeof p.DONE === "boolean" ? p.DONE : DEFAULT_COLUMN_VISIBILITY.DONE,
    };
  } catch {
    return DEFAULT_COLUMN_VISIBILITY;
  }
}

const DUE_FILTER_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "overdue", label: "마감 지남 (미완료)" },
  { value: "today", label: "오늘 마감" },
  { value: "week", label: "이번 주 마감" },
  { value: "soon7", label: "7일 이내 마감 (미완료)" },
] as const;
type DueFilterValue = (typeof DUE_FILTER_OPTIONS)[number]["value"];

type Task = {
  id: string;
  title: string;
  /** 목록 API에서는 비워 둠(용량). 상세에서만 로드 */
  description?: string | null;
  dueDate: string;
  isCompleted: boolean;
  status?: TaskStatus | null;
  priority: string;
  parentId: string | null;
  categoryId: string | null;
  orderIndex: number;
  isCollapsed?: boolean;
  assignees?: { id: string; name: string; email: string; position?: string | null; image?: string | null }[];
  assignedTo: { id: string; name: string; email: string; position?: string | null; image?: string | null } | null;
  createdBy: { id: string; name: string; position?: string | null };
  createdById?: string | null;
  projectId?: string | null;
};

function taskCreatorId(t: Task): string | null {
  return t.createdById ?? t.createdBy?.id ?? null;
}

function taskIsMine(t: Task, userId: string): boolean {
  return taskCreatorId(t) === userId;
}

/** 생성자는 아니지만 담당·다중 담당으로 참여 중 */
function taskIsSharedParticipation(t: Task, userId: string): boolean {
  if (!userId || taskIsMine(t, userId)) return false;
  if (t.assignedTo?.id === userId) return true;
  return !!(t.assignees?.some((a) => a.id === userId));
}

function getEffectiveStatus(task: Task): TaskStatus {
  if (task.isCompleted) return "DONE";
  return (task.status as TaskStatus) ?? "TODO";
}

function priorityVariant(priority: string) {
  if (priority === "HIGH") return "destructive";
  if (priority === "LOW") return "secondary";
  return "outline";
}

function priorityLabel(priority: string) {
  if (priority === "HIGH") return "높음";
  if (priority === "LOW") return "낮음";
  return "보통";
}

function statusLabel(status: TaskStatus) {
  return STATUS_LIST.find((s) => s.value === status)?.label ?? status;
}

function normPriority(p: string | undefined | null): "HIGH" | "MEDIUM" | "LOW" {
  const u = String(p ?? "MEDIUM").toUpperCase();
  if (u === "HIGH" || u === "LOW") return u;
  return "MEDIUM";
}

function passesDueFilter(task: Task, filterDue: DueFilterValue): boolean {
  if (filterDue === "all") return true;
  const due = new Date(task.dueDate);
  const now = new Date();
  const startToday = startOfDay(now);
  const endToday = endOfDay(now);

  switch (filterDue) {
    case "overdue":
      return !task.isCompleted && isBefore(due, startToday);
    case "today":
      return isWithinInterval(due, { start: startToday, end: endToday });
    case "week": {
      const wEnd = endOfWeek(now, { weekStartsOn: 1 });
      return isWithinInterval(due, { start: startToday, end: wEnd });
    }
    case "soon7": {
      const end = endOfDay(addDays(startToday, 7));
      return (
        !task.isCompleted && isWithinInterval(due, { start: startToday, end: end })
      );
    }
    default:
      return true;
  }
}

function columnHeaderClass(status: TaskStatus): string {
  switch (status) {
    case "TODO":
      return "border-sky-700 bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-sm";
    case "IN_PROGRESS":
      return "border-amber-600 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm";
    case "DONE":
      return "border-emerald-700 bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-sm";
    default:
      return "";
  }
}

function priorityLeftBarClass(priority: string): string {
  switch (normPriority(priority)) {
    case "HIGH":
      return "border-l-[5px] border-l-red-500";
    case "LOW":
      return "border-l-[5px] border-l-slate-400";
    default:
      return "border-l-[5px] border-l-amber-500";
  }
}

/** 마감 임박/지남 강조용 (미완료만) */
function getDueUrgency(task: Task): { show: boolean; overdue: boolean; label: string } {
  if (task.isCompleted) return { show: false, overdue: false, label: "" };
  const due = startOfDay(new Date(task.dueDate));
  const today = startOfDay(new Date());
  const diff = differenceInCalendarDays(due, today);
  if (diff < 0) return { show: true, overdue: true, label: "마감 지남" };
  if (diff <= 3) return { show: true, overdue: false, label: diff === 0 ? "D-Day" : `D-${diff}` };
  return { show: false, overdue: false, label: "" };
}

type TasksPageResponse = { items: Task[]; total: number; hasMore: boolean };

async function fetchTasksAllJson(url: string): Promise<Task[]> {
  const r = await fetch(url);
  if (!r.ok) return [];
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

async function fetchTasksPageJson(url: string): Promise<TasksPageResponse> {
  const r = await fetch(url);
  if (!r.ok) return { items: [], total: 0, hasMore: false };
  const data = await r.json();
  if (Array.isArray(data)) {
    return { items: data, total: data.length, hasMore: false };
  }
  return {
    items: Array.isArray(data.items) ? data.items : [],
    total: typeof data.total === "number" ? data.total : 0,
    hasMore: Boolean(data.hasMore),
  };
}

type TaskLink = { id: string; parentId: string; childId: string };
function linksFetcher(url: string): Promise<TaskLink[]> {
  return fetch(url).then((r: any) => (r.ok ? r.json() : []));
}

class ViewErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state: { hasError: boolean } = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[tasks] view render error:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-dashed border-gray-200 bg-muted/20 py-16 text-center text-muted-foreground">
          <p className="mb-3 text-sm">이 화면을 표시할 수 없습니다.</p>
          <p className="text-xs">
            우측 상단에서 다른 탭으로 이동하거나 새로고침 후 다시 시도해 주세요.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function TasksPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "">("");
  const [filterAssigneeId, setFilterAssigneeId] = useState<string>("");
  const [filterPriority, setFilterPriority] = useState<"" | "HIGH" | "MEDIUM" | "LOW">("");
  const [filterDue, setFilterDue] = useState<DueFilterValue>("all");
  const [columnVisible, setColumnVisible] = useState<ColumnVisibility>(DEFAULT_COLUMN_VISIBILITY);
  const [columnsReady, setColumnsReady] = useState(false);
  const [view, setView] = useState<"list" | "mindmap" | "log">("list");
  const [mindmapMounted, setMindmapMounted] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [projectScopeFilter, setProjectScopeFilter] = useState<ProjectScopeFilter>(() => {
    if (typeof window === "undefined") return "all";
    try {
      const raw = localStorage.getItem(PROJECT_SCOPE_STORAGE_KEY);
      if (raw === "mine" || raw === "shared" || raw === "all") return raw;
    } catch {
      /* ignore */
    }
    return "all";
  });
  const projectScopeHydratedRef = useRef(false);
  const [mindmapToolbarHost, setMindmapToolbarHost] = useState<HTMLDivElement | null>(null);

  /** 마인드맵이 아니면 툴바 포털 DOM 해제 */
  useEffect(() => {
    if (view !== "mindmap") setMindmapToolbarHost(null);
  }, [view]);

  /** 마인드맵·필터·보기 범위 적용 시 전체 목록 필요 (부분 페이지에만 클라이언트 필터를 쓰면 안 됨) */
  const needsFullTaskList =
    view === "mindmap" ||
    filterStatus !== "" ||
    filterAssigneeId !== "" ||
    filterPriority !== "" ||
    filterDue !== "all" ||
    projectScopeFilter !== "all";

  useEffect(() => {
    setColumnVisible(loadColumnVisibility());
    setColumnsReady(true);
  }, []);

  /** 저장된 보기 범위 또는(없으면) 임원·관리자 기본 = 내 프로젝트 */
  useEffect(() => {
    if (authStatus !== "authenticated" || !session?.user || projectScopeHydratedRef.current) return;
    projectScopeHydratedRef.current = true;
    try {
      const raw = localStorage.getItem(PROJECT_SCOPE_STORAGE_KEY);
      if (raw === "mine" || raw === "shared" || raw === "all") {
        setProjectScopeFilter(raw);
        return;
      }
    } catch {
      /* ignore */
    }
    const role = session.user.role;
    if (role === "EXECUTIVE" || role === "ADMIN") {
      setProjectScopeFilter("mine");
    }
  }, [authStatus, session?.user]);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      projectScopeHydratedRef.current = false;
    }
  }, [authStatus]);

  useEffect(() => {
    if (typeof window === "undefined" || authStatus !== "authenticated") return;
    try {
      localStorage.setItem(PROJECT_SCOPE_STORAGE_KEY, projectScopeFilter);
    } catch {
      /* ignore */
    }
  }, [projectScopeFilter, authStatus]);

  useEffect(() => {
    if (!columnsReady || typeof window === "undefined") return;
    try {
      localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(columnVisible));
    } catch {
      /* ignore */
    }
  }, [columnVisible, columnsReady]);

  // 마인드맵 탭 진입 후 한 프레임 뒤에 마운트 → removeChild 등 DOM 충돌 완화
  useEffect(() => {
    if (view !== "mindmap") {
      setMindmapMounted(false);
      return;
    }
    const t = requestAnimationFrame(() => {
      setMindmapMounted(true);
    });
    return () => cancelAnimationFrame(t);
  }, [view]);

  const tasksFullKey = authStatus === "authenticated" && needsFullTaskList ? "/api/tasks?all=1" : null;
  const {
    data: tasksFullData,
    isLoading: tasksFullLoading,
    mutate: mutateTasksFull,
  } = useSWR<Task[]>(tasksFullKey, fetchTasksAllJson, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 12_000,
  });

  const getTaskPageKey = useCallback(
    (pageIndex: number, previousPageData: TasksPageResponse | null) => {
      if (authStatus !== "authenticated") return null;
      if (needsFullTaskList) return null;
      if (previousPageData && !previousPageData.hasMore) return null;
      return `/api/tasks?limit=20&offset=${pageIndex * 20}`;
    },
    [authStatus, needsFullTaskList]
  );

  const {
    data: taskPages,
    size: taskPageSize,
    setSize: setTaskPageSize,
    isLoading: tasksPagesLoading,
    mutate: mutateTaskPages,
  } = useSWRInfinite<TasksPageResponse>(getTaskPageKey, fetchTasksPageJson, {
    revalidateFirstPage: true,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 12_000,
  });

  const { data: linksData = [], mutate: mutateLinks, isLoading: linksLoading } = useSWR<TaskLink[]>(
    authStatus === "authenticated" && view === "mindmap" ? "/api/tasks/links" : null,
    linksFetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 12_000,
    }
  );

  const tasks = useMemo(() => {
    if (needsFullTaskList) return Array.isArray(tasksFullData) ? tasksFullData : [];
    if (!taskPages?.length) return [];
    return taskPages.flatMap((p) => p.items);
  }, [needsFullTaskList, tasksFullData, taskPages]);

  const tasksTotalCount = useMemo(() => {
    if (needsFullTaskList) return tasks.length;
    return taskPages?.[0]?.total ?? tasks.length;
  }, [needsFullTaskList, taskPages, tasks.length]);

  const tasksLoading = needsFullTaskList ? tasksFullLoading : tasksPagesLoading && !taskPages;
  const hasMoreTasksPaged =
    !needsFullTaskList && Boolean(taskPages?.length && taskPages[taskPages.length - 1]?.hasMore);

  const taskLinks = Array.isArray(linksData) ? linksData : [];

  const refreshTasks = useCallback(() => {
    void mutateTasksFull();
    void mutateTaskPages();
    void mutateLinks();
  }, [mutateTasksFull, mutateTaskPages, mutateLinks]);

  const isTaskDeleteAdmin =
    session?.user?.role === "EXECUTIVE" || session?.user?.role === "ADMIN";
  const currentUserId = session?.user?.id ?? "";

  const canDeleteTask = useCallback(
    (t: Task) => {
      const cid = t.createdById ?? t.createdBy?.id ?? null;
      return isTaskDeleteAdmin || (!!cid && cid === currentUserId);
    },
    [isTaskDeleteAdmin, currentUserId]
  );

  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      if (!confirm("이 프로젝트를 삭제(휴지통 이동)할까요?")) return;
      setDeletingTaskId(taskId);
      try {
        const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error ?? "삭제 실패");
        toast.success("삭제되었습니다.");
        refreshTasks();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
      } finally {
        setDeletingTaskId(null);
      }
    },
    [refreshTasks]
  );

  const updateTaskStatus = useCallback(
    async (taskId: string, newStatus: TaskStatus) => {
      setUpdatingStatusId(taskId);
      try {
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus, isCompleted: newStatus === "DONE" }),
        });
        if (!res.ok) throw new Error("수정 실패");
        refreshTasks();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "수정에 실패했습니다.");
      } finally {
        setUpdatingStatusId(null);
      }
    },
    [refreshTasks]
  );

  const scopeFilteredTasks = useMemo(() => {
    if (!currentUserId || projectScopeFilter === "all") return tasks;
    if (projectScopeFilter === "mine") {
      return tasks.filter((t) => taskIsMine(t, currentUserId));
    }
    return tasks.filter((t) => taskIsSharedParticipation(t, currentUserId));
  }, [tasks, projectScopeFilter, currentUserId]);

  const filteredTasks = useMemo(() => {
    return scopeFilteredTasks.filter((t: Task) => {
      if (filterStatus && getEffectiveStatus(t) !== filterStatus) return false;
      if (
        filterAssigneeId &&
        t.assignedTo?.id !== filterAssigneeId &&
        !(t.assignees?.some((a) => a.id === filterAssigneeId))
      )
        return false;
      if (filterPriority && normPriority(t.priority) !== filterPriority) return false;
      if (!passesDueFilter(t, filterDue)) return false;
      return true;
    });
  }, [scopeFilteredTasks, filterStatus, filterAssigneeId, filterPriority, filterDue]);

  const assigneePairs = tasks.flatMap((t: Task) => {
    const list = t.assignees?.length ? t.assignees : t.assignedTo ? [t.assignedTo] : [];
    return list.map((a) => [a.id, a] as [string, NonNullable<Task["assignedTo"]>]);
  });
  const assigneeOptions = Array.from(new Map(assigneePairs).entries());
  const hasActiveFilter =
    filterStatus !== "" ||
    filterAssigneeId !== "" ||
    filterPriority !== "" ||
    filterDue !== "all";

  const visibleStatusColumns = useMemo(
    () => STATUS_LIST.filter((s) => columnVisible[s.value]),
    [columnVisible]
  );

  const mindmapTasks = useMemo(() => {
    return filteredTasks.map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description ?? null,
      dueDate: t.dueDate,
      isCompleted: !!t.isCompleted,
      status: t.status ?? null,
      priority: t.priority,
      parentId: t.parentId ?? null,
      isCollapsed: !!t.isCollapsed,
      projectId: t.projectId ?? null,
      assignees: t.assignees,
      assignedTo: t.assignees?.[0] ?? t.assignedTo,
      createdById: t.createdById ?? t.createdBy?.id ?? null,
    }));
  }, [filteredTasks]);

  const mindmapTaskIdSet = useMemo(() => new Set(mindmapTasks.map((t: { id: string }) => t.id)), [mindmapTasks]);

  const mindmapLinksForView = useMemo(
    () =>
      taskLinks.filter(
        (l) => mindmapTaskIdSet.has(l.parentId) && mindmapTaskIdSet.has(l.childId)
      ),
    [taskLinks, mindmapTaskIdSet]
  );

  if (authStatus === "loading" || authStatus === "unauthenticated") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">
          {authStatus === "unauthenticated" ? "로그인이 필요합니다." : "불러오는 중..."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div className="border-border flex flex-col gap-4 border-b border-gray-200 pb-6">
        <PageHeadline
          title={view === "log" ? "Daily Report" : "프로젝트"}
          description={
            view === "log"
              ? "Record your daily work"
              : "프로젝트를 목록·Mindmap·Daily Report로 관리합니다."
          }
        />
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={view} onValueChange={(v: any) => setView(v as any)} className="w-auto">
            <TabsList className="bg-muted/50 h-9 rounded-lg border border-gray-200 p-0.5">
              <TabsTrigger value="list" className="gap-2 rounded-md px-3">
                <ListIcon className="size-4" />
                Projects
              </TabsTrigger>
              <TabsTrigger value="mindmap" className="gap-2 rounded-md px-3">
                <GitBranch className="size-4" />
                Mindmap
              </TabsTrigger>
              <TabsTrigger value="log" className="gap-2 rounded-md px-3">
                <FileText className="size-4" />
                Daily Report
              </TabsTrigger>
            </TabsList>
            <TabsContent value="list" className="mt-0" />
            <TabsContent value="mindmap" className="mt-0" />
            <TabsContent value="log" className="mt-0" />
          </Tabs>
          {view === "mindmap" && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground hidden text-xs sm:inline">보기</span>
              <Select
                value={projectScopeFilter}
                onValueChange={(v) => setProjectScopeFilter(v as ProjectScopeFilter)}
              >
                <SelectTrigger className="h-9 w-[148px] border-gray-200 text-left text-sm">
                  <SelectValue placeholder="범위" />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value="mine">내 프로젝트</SelectItem>
                  <SelectItem value="shared">공유·참여</SelectItem>
                  <SelectItem value="all">전체 보기</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {view === "list" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "border-gray-200 text-muted-foreground",
                    hasActiveFilter && "border-amber-400 text-amber-700"
                  )}
                >
                  <Filter className="mr-2 size-4" />
                  필터
                  {hasActiveFilter && (
                    <span className="ml-1 rounded bg-amber-100 px-1 text-[10px]">적용중</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="start">
                <div className="space-y-3">
                  <p className="text-sm font-medium">상태</p>
                  <Select
                    value={filterStatus || "all"}
                    onValueChange={(v) => setFilterStatus(v === "all" ? "" : (v as TaskStatus))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="전체" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      {STATUS_LIST.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm font-medium">담당자</p>
                  <Select
                    value={filterAssigneeId || "all"}
                    onValueChange={(v) => setFilterAssigneeId(v === "all" ? "" : v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="전체" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      {assigneeOptions.map(([id, u]: any) => (
                        <SelectItem key={id} value={id}>
                          {formatUserName(u)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm font-medium">우선순위</p>
                  <Select
                    value={filterPriority || "all"}
                    onValueChange={(v) =>
                      setFilterPriority(v === "all" ? "" : (v as "HIGH" | "MEDIUM" | "LOW"))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="전체" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      <SelectItem value="HIGH">높음</SelectItem>
                      <SelectItem value="MEDIUM">보통</SelectItem>
                      <SelectItem value="LOW">낮음</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm font-medium">마감일</p>
                  <Select
                    value={filterDue}
                    onValueChange={(v) => setFilterDue(v as DueFilterValue)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DUE_FILTER_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setFilterStatus("");
                      setFilterAssigneeId("");
                      setFilterPriority("");
                      setFilterDue("all");
                    }}
                  >
                    필터 초기화
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
          <Button
            onClick={() => {
              setCreateParentId(null);
              setCreateOpen(true);
            }}
            className="ml-auto bg-foreground text-background hover:bg-foreground/90"
          >
            <Plus className="mr-2 size-4" />
            새 프로젝트
          </Button>
        </div>
        {view === "mindmap" && mindmapMounted ? (
          <div
            ref={setMindmapToolbarHost}
            className="mindmap-toolbar sticky top-0 z-[100] mt-3 flex w-full min-w-0 flex-wrap items-center gap-2 border-b border-border bg-background/95 py-2 pr-2 pl-1 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80"
          />
        ) : null}
      </div>

      <ViewErrorBoundary key={view}>
        {view === "list" && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-gray-200 bg-muted/15 px-4 py-3">
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
              <span className="text-muted-foreground text-xs font-semibold tracking-wide">보기 범위</span>
              <Select
                value={projectScopeFilter}
                onValueChange={(v) => setProjectScopeFilter(v as ProjectScopeFilter)}
              >
                <SelectTrigger className="h-9 w-full min-w-[160px] border-gray-200 sm:w-[180px]" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value="mine">내 프로젝트 (내가 생성)</SelectItem>
                  <SelectItem value="shared">공유·참여 (담당·배정)</SelectItem>
                  <SelectItem value="all">전체 보기 (팀에 허용된 목록)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <span className="text-muted-foreground w-full text-xs font-semibold tracking-wide sm:w-auto">
              컬럼 표시
            </span>
            <div className="flex flex-wrap items-center gap-4">
              {STATUS_LIST.map((s) => (
                <div key={s.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`col-${s.value}`}
                    checked={columnVisible[s.value]}
                    onCheckedChange={(c) => {
                      const on = c === true;
                      setColumnVisible((prev) => {
                        const next = { ...prev, [s.value]: on };
                        if (!next.TODO && !next.IN_PROGRESS && !next.DONE) return prev;
                        return next;
                      });
                    }}
                  />
                  <Label htmlFor={`col-${s.value}`} className="cursor-pointer text-sm font-normal">
                    {s.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        )}
        {view === "log" ? (
          <WorkLogTab />
        ) : view === "mindmap" ? (
          !mindmapMounted ? (
            <div className="min-h-[480px] w-full space-y-3 rounded-xl border bg-muted/10 p-4">
              <Skeleton className="h-8 w-48 rounded-md" />
              <Skeleton className="h-[420px] w-full rounded-lg" />
            </div>
          ) : tasksLoading && tasks.length === 0 ? (
            <div className="min-h-[480px] w-full space-y-3 rounded-xl border bg-muted/10 p-4">
              <Skeleton className="h-8 w-64 rounded-md" />
              <Skeleton className="h-[420px] w-full rounded-lg" />
            </div>
          ) : linksLoading ? (
            <div className="min-h-[480px] w-full space-y-3 rounded-xl border bg-muted/10 p-4">
              <Skeleton className="h-8 w-56 rounded-md" />
              <Skeleton className="h-[420px] w-full rounded-lg" />
            </div>
          ) : (
            <div key="mindmap" className="min-h-[480px] w-full min-w-0">
              <TaskTreeView
                toolbarPortalEl={mindmapToolbarHost}
                tasks={mindmapTasks as any}
                taskLinks={mindmapLinksForView as any}
                onRefresh={refreshTasks}
                onTaskClick={(taskId: string, projectId?: string | null) => {
                  if (projectId) {
                    router.push(`/projects/${projectId}`);
                  } else {
                    router.push(`/tasks/${taskId}`);
                  }
                }}
                onTaskHover={(taskId: string) => {
                  const row = mindmapTasks.find((t: { id: string }) => t.id === taskId);
                  const pid = row && "projectId" in row ? (row as { projectId?: string | null }).projectId : null;
                  if (pid) router.prefetch(`/projects/${pid}`);
                  else router.prefetch(`/tasks/${taskId}`);
                }}
                onCreateTask={(parentId: any) => {
                  setCreateParentId(parentId);
                  setCreateOpen(true);
                }}
                currentUserId={currentUserId}
                isTaskDeleteAdmin={isTaskDeleteAdmin}
              />
            </div>
          )
        ) : tasksLoading && tasks.length === 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-3 rounded-xl border bg-muted/10 p-3">
                <Skeleton className="h-9 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            ))}
          </div>
        ) : visibleStatusColumns.length === 0 ? (
          <div className="border-border rounded-lg border border-dashed border-amber-300 bg-amber-50/50 py-12 text-center text-amber-900">
            <p className="text-sm">보드에 표시할 컬럼을 하나 이상 선택해 주세요.</p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="border-border rounded-lg border border-dashed border-gray-200 bg-muted/20 py-16 text-center text-muted-foreground">
            <p className="mb-4 text-sm">조건에 맞는 프로젝트가 없습니다.</p>
            <Button
              onClick={() => {
                setCreateParentId(null);
                setCreateOpen(true);
              }}
              variant="outline"
              size="sm"
            >
              <Plus className="mr-2 size-4" />
              새 프로젝트
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
          <div
            className={cn(
              "grid gap-4",
              visibleStatusColumns.length === 1 && "grid-cols-1",
              visibleStatusColumns.length === 2 && "grid-cols-1 md:grid-cols-2",
              visibleStatusColumns.length >= 3 && "grid-cols-1 md:grid-cols-3"
            )}
          >
            {visibleStatusColumns.map((col) => {
              const list = filteredTasks.filter((t: Task) => getEffectiveStatus(t) === col.value);
              return (
                <div
                  key={col.value}
                  className="border-border flex flex-col overflow-hidden rounded-xl border border-gray-200/90 bg-muted/10 shadow-sm"
                >
                  <div
                    className={cn(
                      "flex items-center justify-between border-b px-4 py-3",
                      columnHeaderClass(col.value)
                    )}
                  >
                    <span className="text-sm font-semibold">{col.label}</span>
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium tabular-nums">
                      {list.length}개
                    </span>
                  </div>
                  <div className="flex min-h-[120px] flex-1 flex-col gap-2.5 p-3">
                    {list.length === 0 ? (
                      <p className="text-muted-foreground py-8 text-center text-xs">없음</p>
                    ) : (
                      list.map((task: Task) => {
                        const s = getEffectiveStatus(task);
                        const prev = s === "DONE" ? "IN_PROGRESS" : s === "IN_PROGRESS" ? "TODO" : null;
                        const next = s === "TODO" ? "IN_PROGRESS" : s === "IN_PROGRESS" ? "DONE" : null;
                        const dueU = getDueUrgency(task);
                        return (
                          <div
                            key={task.id}
                            className={cn(
                              "border-border overflow-hidden rounded-lg border border-gray-200/90 bg-card shadow-sm transition-shadow hover:shadow-md",
                              priorityLeftBarClass(task.priority)
                            )}
                          >
                            <Link
                              href={`/tasks/${task.id}`}
                              prefetch={true}
                              className="block w-full px-3 pt-3 text-left outline-none"
                            >
                              <p
                                className={cn(
                                  "font-medium text-foreground line-clamp-2",
                                  task.isCompleted && "text-muted-foreground line-through"
                                )}
                              >
                                {task.title}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Badge variant={priorityVariant(task.priority)} className="text-[10px]">
                                  {priorityLabel(task.priority)}
                                </Badge>
                                {dueU.show && (
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "border-2 text-[10px] font-semibold",
                                      dueU.overdue
                                        ? "border-red-600 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                                        : "border-red-500 bg-red-50/80 text-red-700 dark:bg-red-950/30 dark:text-red-200"
                                    )}
                                  >
                                    {dueU.overdue ? "마감 지남" : `마감 임박 ${dueU.label}`}
                                  </Badge>
                                )}
                                <span className="text-muted-foreground text-xs">
                                  {format(new Date(task.dueDate), "M월 d일", { locale: ko })}
                                </span>
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <TaskAssigneeAvatars assignees={task.assignees} assignedTo={task.assignedTo} size={24} />
                                <span className="text-muted-foreground text-xs">
                                  {task.assignees && task.assignees.length > 0
                                    ? task.assignees.map((a) => formatUserName(a)).join(", ")
                                    : task.assignedTo
                                      ? formatUserName(task.assignedTo)
                                      : "미지정"}
                                </span>
                              </div>
                            </Link>
                            <div className="mt-3 flex items-center gap-2 px-3 pb-3">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 px-2 text-xs"
                                disabled={!prev || updatingStatusId === task.id}
                                onClick={() => prev && updateTaskStatus(task.id, prev as any)}
                              >
                                ←
                              </Button>
                              <div className="flex-1" onClick={(e: any) => e.stopPropagation()}>
                                <Select
                                  value={s}
                                  onValueChange={(v: any) => updateTaskStatus(task.id, v as TaskStatus)}
                                  disabled={updatingStatusId === task.id}
                                >
                                  <SelectTrigger className="h-8 border-gray-200 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {STATUS_LIST.map((opt: any) => (
                                      <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 px-2 text-xs"
                                disabled={!next || updatingStatusId === task.id}
                                onClick={() => next && updateTaskStatus(task.id, next as any)}
                              >
                                →
                              </Button>
                              {canDeleteTask(task) && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                                  title="삭제(휴지통)"
                                  disabled={deletingTaskId === task.id}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void handleDeleteTask(task.id);
                                  }}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              )}
                            </div>
                            <p className="mt-2 text-[10px] text-muted-foreground">
                              현재: {statusLabel(s)}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {hasMoreTasksPaged && (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTaskPageSize((n) => n + 1)}
                disabled={tasksPagesLoading}
              >
                더 불러오기 ({tasks.length}/{tasksTotalCount})
              </Button>
            </div>
          )}
          </div>
        )}
      </ViewErrorBoundary>

      <CreateTaskModal
        open={createOpen}
        onOpenChange={(open: any) => {
          setCreateOpen(open);
        }}
        onCreated={() => {
          refreshTasks();
          setCreateOpen(false);
        }}
        parentId={createParentId}
        orderIndex={tasksTotalCount}
        defaultAssignedToId={(session?.user as any)?.id ?? null}
      />
    </div>
  );
}
