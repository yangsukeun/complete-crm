"use client";

import "./components/mindmap-toolbar.css";
import React, {
  Component,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { Plus, Filter, GitBranch, FileText, List as ListIcon, List as ListTableIcon, Trash2, LayoutGrid } from "lucide-react";
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
import {
  COLOR_FILTER_DEFAULT_ONLY,
  getTaskCardAccentColor,
  PROJECT_TASK_COLORS,
  taskHasPaletteColor,
} from "@/lib/project-task-colors";
import { isPlainLeftClick } from "@/lib/peek-navigation";
import { workspaceFetchHeaders } from "@/lib/workspace-fetch-headers";
import {
  mindmapCanvasIdFromMode,
  mindmapShellModeFromQuery,
  type MindmapShellMode,
} from "@/lib/mindmap-canvas-keys";
import {
  taskCompletionShelfQuery,
  type TaskCompletionShelf,
} from "@/lib/task-visibility";
import { TaskDetailDrawer } from "@/components/task-detail-drawer";
import { SplitView, useIsMdUp } from "@/components/ui/split-view";
import { TaskDetailContent } from "./components/task-detail-content";
import { ProjectTableView } from "@/components/project-table-view";
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
/** 보드/테이블 전환 (스펙: projectViewMode) — 이전 키는 load 시만 fallback */
const PROJECT_VIEW_MODE_KEY = "projectViewMode";
const LEGACY_PROJECTS_VIEW_MODE_KEY = "tasks-projects-view-mode";
/** 목록·마인드맵 공통: 대표/관리자의 팀 전체 혼탕 표시 구분용 */
const PROJECT_SCOPE_STORAGE_KEY = "tasks-project-scope-filter";
const MINDMAP_SHELL_STORAGE_KEY = "tasks-mindmap-shell-v1";
const TASK_COMPLETION_SHELF_KEY = "tasks-completion-shelf-v1";
type ProjectsViewMode = "board" | "table";
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

function loadProjectsViewMode(): ProjectsViewMode {
  if (typeof window === "undefined") return "board";
  try {
    const raw = localStorage.getItem(PROJECT_VIEW_MODE_KEY);
    if (raw === "table" || raw === "board") return raw;
    const legacy = localStorage.getItem(LEGACY_PROJECTS_VIEW_MODE_KEY);
    if (legacy === "table" || legacy === "board") return legacy;
  } catch {
    /* ignore */
  }
  return "board";
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
  dueDate: string | null;
  isCompleted: boolean;
  status?: TaskStatus | null;
  priority: string;
  parentId: string | null;
  /** 마인드맵 상위 노드 생성 시 하위와 동일 분류 유지 */
  categoryId: string | null;
  orderIndex: number;
  isCollapsed?: boolean;
  assignees?: { id: string; name: string; email: string; position?: string | null; image?: string | null }[];
  assignedTo: { id: string; name: string; email: string; position?: string | null; image?: string | null } | null;
  createdBy: { id: string; name: string; position?: string | null };
  createdById?: string | null;
  projectId?: string | null;
  color?: string | null;
  completedAt?: string | null;
  archivedAt?: string | null;
  defaultCollapsed?: boolean;
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
  if (task.dueDate == null || task.dueDate === "") return false;
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

/** 마감 임박/지남 강조용 (미완료만) */
function getDueUrgency(task: Task): { show: boolean; overdue: boolean; label: string } {
  if (task.isCompleted) return { show: false, overdue: false, label: "" };
  if (task.dueDate == null || task.dueDate === "") return { show: false, overdue: false, label: "" };
  const due = startOfDay(new Date(task.dueDate));
  const today = startOfDay(new Date());
  const diff = differenceInCalendarDays(due, today);
  if (diff < 0) return { show: true, overdue: true, label: "마감 지남" };
  if (diff <= 3) return { show: true, overdue: false, label: diff === 0 ? "D-Day" : `D-${diff}` };
  return { show: false, overdue: false, label: "" };
}

type TasksPageResponse = { items: Task[]; total: number; hasMore: boolean };

async function fetchTasksAllJson(url: string): Promise<Task[]> {
  const r = await fetch(url, {
    credentials: "include",
    headers: workspaceFetchHeaders(),
  });
  if (!r.ok) return [];
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

async function fetchTasksPageJson(url: string): Promise<TasksPageResponse> {
  const r = await fetch(url, {
    credentials: "include",
    headers: workspaceFetchHeaders(),
  });
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
  return fetch(url, {
    credentials: "include",
    headers: workspaceFetchHeaders(),
  }).then((r: Response) => (r.ok ? r.json() : []));
}

async function fetchProjectMindmapSummaryJson(url: string) {
  const r = await fetch(url, { credentials: "include", headers: workspaceFetchHeaders() });
  if (!r.ok) return [];
  const j = await r.json();
  return Array.isArray(j) ? j : [];
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

function TasksPageInner() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
  /** 초기값은 항상 고정 — localStorage/역할 기반 보정은 아래 useEffect에서만(하이드레이션 안전) */
  const [projectScopeFilter, setProjectScopeFilter] = useState<ProjectScopeFilter>("all");
  const [adminTasksUserId, setAdminTasksUserId] = useState<string>("");
  const [colorFilter, setColorFilter] = useState<string | null>(null);
  const [taskCompletionShelf, setTaskCompletionShelf] = useState<TaskCompletionShelf>("active");
  const taskShelfHydratedRef = useRef(false);
  const projectScopeHydratedRef = useRef(false);
  const [mindmapToolbarHost, setMindmapToolbarHost] = useState<HTMLDivElement | null>(null);
  /** 노션식 오른쪽 패널 미리보기 */
  const [peekTaskId, setPeekTaskId] = useState<string | null>(null);
  /** 데스크톱 split 뷰용 선택 업무 */
  const [splitPeekTaskId, setSplitPeekTaskId] = useState<string | null>(null);
  const [projectsViewMode, setProjectsViewMode] = useState<ProjectsViewMode>("board");
  const [projectsViewModeReady, setProjectsViewModeReady] = useState(false);
  const isMdUp = useIsMdUp();

  const setProjectsViewModePersisted = useCallback((mode: ProjectsViewMode) => {
    setProjectsViewMode(mode);
    try {
      localStorage.setItem(PROJECT_VIEW_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, []);

  const openTaskPeek = useCallback((taskId: string) => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
      setSplitPeekTaskId(taskId);
    } else {
      setPeekTaskId(taskId);
    }
  }, []);

  /** 마인드맵이 아니면 툴바 포털 DOM 해제 */
  useEffect(() => {
    if (view !== "mindmap") setMindmapToolbarHost(null);
  }, [view]);

  useEffect(() => {
    if (view === "log") setSplitPeekTaskId(null);
  }, [view]);

  useEffect(() => {
    setProjectsViewMode(loadProjectsViewMode());
    setProjectsViewModeReady(true);
  }, []);

  useEffect(() => {
    if (!projectsViewModeReady) return;
    try {
      localStorage.setItem(PROJECT_VIEW_MODE_KEY, projectsViewMode);
    } catch {
      /* ignore */
    }
  }, [projectsViewMode, projectsViewModeReady]);

  const isTasksAdmin =
    session?.user?.role === "EXECUTIVE" || session?.user?.role === "ADMIN";

  useEffect(() => {
    if (!isTasksAdmin) setAdminTasksUserId("");
  }, [isTasksAdmin]);

  const adminUsersSwrKey =
    authStatus === "authenticated" && isTasksAdmin ? "/api/users" : null;
  const { data: tasksAdminUsers = [] } = useSWR(
    adminUsersSwrKey,
    async (url: string) => {
      const r = await fetch(url, {
        credentials: "include",
        headers: workspaceFetchHeaders(),
      });
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    },
    { revalidateOnFocus: false }
  );

  const mindmapMode: MindmapShellMode = useMemo(() => {
    if (view !== "mindmap") return "all";
    return mindmapShellModeFromQuery(searchParams.get("mindmap"));
  }, [view, searchParams]);

  /** 온보딩 투어: 마인드맵 전체 조감도로 진입(onboardingTour 쿼리는 TourProvider가 정리) */
  const onboardingLayoutRef = useRef(false);
  useEffect(() => {
    if (searchParams.get("onboardingTour") !== "1") onboardingLayoutRef.current = false;
  }, [searchParams]);
  useLayoutEffect(() => {
    if (authStatus !== "authenticated") return;
    if (searchParams.get("onboardingTour") !== "1") return;
    if (onboardingLayoutRef.current) return;
    onboardingLayoutRef.current = true;
    setView("mindmap");
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("mindmap", "all");
    sp.set("onboardingTour", "1");
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }, [authStatus, pathname, router, searchParams]);

  const mindmapProjectId = useMemo(() => {
    if (view !== "mindmap" || mindmapMode !== "project") return null as string | null;
    const raw = searchParams.get("projectId");
    if (!raw || raw.toLowerCase() === "null") return null;
    return raw;
  }, [view, mindmapMode, searchParams]);

  /** 마인드맵 탭 진입 시 URL에 mindmap 쿼리가 없으면 localStorage 또는 기본(all)로 채움 */
  useLayoutEffect(() => {
    if (view !== "mindmap") return;
    if (searchParams.has("mindmap")) return;
    const sp = new URLSearchParams(searchParams.toString());
    try {
      const raw = localStorage.getItem(MINDMAP_SHELL_STORAGE_KEY);
      if (raw) {
        const j = JSON.parse(raw) as { mode?: string; projectId?: string | null };
        const m = mindmapShellModeFromQuery(j.mode ?? "all");
        sp.set("mindmap", m);
        if (m === "project" && typeof j.projectId === "string" && j.projectId.trim()) {
          sp.set("projectId", j.projectId.trim());
        }
      } else {
        sp.set("mindmap", "all");
      }
    } catch {
      sp.set("mindmap", "all");
    }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [view, searchParams, pathname, router]);

  const onMindmapNavigate = useCallback(
    (next: { mode: MindmapShellMode; projectId?: string | null }) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("mindmap", next.mode);
      if (next.mode === "project" && next.projectId) {
        sp.set("projectId", next.projectId);
      } else {
        sp.delete("projectId");
      }
      try {
        localStorage.setItem(
          MINDMAP_SHELL_STORAGE_KEY,
          JSON.stringify({
            mode: next.mode,
            projectId: next.mode === "project" ? next.projectId ?? null : null,
          })
        );
      } catch {
        /* ignore */
      }
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  /** 목록 탭: 필터·보기 범위 적용 시 전체 목록 필요. 마인드맵은 projectId 스코프 SWR로 별도 로드 */
  const needsFullTaskList =
    view !== "mindmap" &&
    (filterStatus !== "" ||
      filterAssigneeId !== "" ||
      filterPriority !== "" ||
      filterDue !== "all" ||
      projectScopeFilter !== "all" ||
      colorFilter !== null ||
      (isTasksAdmin && adminTasksUserId !== ""));

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
      taskShelfHydratedRef.current = false;
    }
  }, [authStatus]);

  useEffect(() => {
    if (authStatus !== "authenticated" || taskShelfHydratedRef.current) return;
    taskShelfHydratedRef.current = true;
    try {
      const raw = localStorage.getItem(TASK_COMPLETION_SHELF_KEY);
      if (raw === "active" || raw === "recent" || raw === "all") setTaskCompletionShelf(raw);
    } catch {
      /* ignore */
    }
  }, [authStatus]);

  useEffect(() => {
    if (typeof window === "undefined" || authStatus !== "authenticated") return;
    try {
      localStorage.setItem(TASK_COMPLETION_SHELF_KEY, taskCompletionShelf);
    } catch {
      /* ignore */
    }
  }, [taskCompletionShelf, authStatus]);

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

  const taskShelfQs = useMemo(
    () => taskCompletionShelfQuery(taskCompletionShelf),
    [taskCompletionShelf]
  );

  const tasksFullKey =
    authStatus === "authenticated" && needsFullTaskList
      ? `/api/tasks?all=1&${taskShelfQs}${adminTasksUserId ? `&userId=${encodeURIComponent(adminTasksUserId)}` : ""}`
      : null;
  const {
    data: tasksFullData,
    isLoading: tasksFullLoading,
    mutate: mutateTasksFull,
  } = useSWR<Task[]>(tasksFullKey, fetchTasksAllJson, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // revalidateOnMount: false 는 SWR 2에서 초기 마운트 시 요청을 스킵해 목록이 영영 비어 있을 수 있음
    revalidateIfStale: false,
    dedupingInterval: 300_000,
  });

  const getTaskPageKey = useCallback(
    (pageIndex: number, previousPageData: TasksPageResponse | null) => {
      if (authStatus !== "authenticated") return null;
      if (needsFullTaskList) return null;
      if (previousPageData && !previousPageData.hasMore) return null;
      const q = new URLSearchParams();
      q.set("limit", "20");
      q.set("offset", String(pageIndex * 20));
      if (isTasksAdmin && adminTasksUserId) q.set("userId", adminTasksUserId);
      new URLSearchParams(taskShelfQs).forEach((v, k) => q.set(k, v));
      return `/api/tasks?${q.toString()}`;
    },
    [authStatus, needsFullTaskList, isTasksAdmin, adminTasksUserId, taskShelfQs]
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
    revalidateOnMount: true,
    dedupingInterval: 30_000,
  });

  const projectMindmapKey =
    authStatus === "authenticated" && view === "mindmap" ? "/api/projects?mindmapSummary=1" : null;
  const {
    data: projectMindmapSummaries = [],
    isLoading: projectMindmapLoading,
    mutate: mutateProjectMindmap,
  } = useSWR(projectMindmapKey, fetchProjectMindmapSummaryJson, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    dedupingInterval: 20_000,
  });

  const mindmapAdminSuffix =
    isTasksAdmin && adminTasksUserId ? `&userId=${encodeURIComponent(adminTasksUserId)}` : "";
  const mindmapScopedTasksKey =
    authStatus === "authenticated" &&
    view === "mindmap" &&
    mindmapMode === "project" &&
    mindmapProjectId
      ? `/api/tasks?projectId=${encodeURIComponent(mindmapProjectId)}${mindmapAdminSuffix}&${taskShelfQs}`
      : authStatus === "authenticated" && view === "mindmap" && mindmapMode === "unassigned"
        ? `/api/tasks?projectId=null${mindmapAdminSuffix}&${taskShelfQs}`
        : null;

  const {
    data: mindmapScopedTasksRaw = [],
    isLoading: mindmapScopedLoading,
    mutate: mutateMindmapScoped,
  } = useSWR<Task[]>(mindmapScopedTasksKey, fetchTasksAllJson, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    revalidateIfStale: false,
    dedupingInterval: 120_000,
  });

  useEffect(() => {
    if (view !== "mindmap") return;
    if (mindmapMode !== "project") return;
    if (mindmapProjectId) return;
    if (projectMindmapLoading) return;
    const list = projectMindmapSummaries as { id: string }[];
    if (list.length > 0) {
      onMindmapNavigate({ mode: "project", projectId: list[0]!.id });
      return;
    }
    onMindmapNavigate({ mode: "all" });
  }, [
    view,
    mindmapMode,
    mindmapProjectId,
    projectMindmapLoading,
    projectMindmapSummaries,
    onMindmapNavigate,
  ]);

  const { data: linksData = [], mutate: mutateLinks, isLoading: linksLoading } = useSWR<TaskLink[]>(
    authStatus === "authenticated" &&
      view === "mindmap" &&
      (mindmapMode === "project" || mindmapMode === "unassigned")
      ? "/api/tasks/links"
      : null,
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

  const refreshTasksDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (refreshTasksDebounceRef.current) clearTimeout(refreshTasksDebounceRef.current);
    };
  }, []);

  const refreshTasks = useCallback(() => {
    if (refreshTasksDebounceRef.current) clearTimeout(refreshTasksDebounceRef.current);
    refreshTasksDebounceRef.current = setTimeout(() => {
      refreshTasksDebounceRef.current = null;
      void mutateTasksFull();
      void mutateTaskPages();
      void mutateLinks();
      void mutateMindmapScoped();
      void mutateProjectMindmap();
    }, 400);
  }, [mutateTasksFull, mutateTaskPages, mutateLinks, mutateMindmapScoped, mutateProjectMindmap]);

  const onTasksDetailUpdated = useCallback(() => {
    refreshTasks();
  }, [refreshTasks]);

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
      if (colorFilter === COLOR_FILTER_DEFAULT_ONLY) {
        if (taskHasPaletteColor(t.color)) return false;
      } else if (colorFilter && (t.color ?? null) !== colorFilter) return false;
      return true;
    });
  }, [scopeFilteredTasks, filterStatus, filterAssigneeId, filterPriority, filterDue, colorFilter]);

  const assigneePairs = tasks.flatMap((t: Task) => {
    const list = t.assignees?.length ? t.assignees : t.assignedTo ? [t.assignedTo] : [];
    return list.map((a) => [a.id, a] as [string, NonNullable<Task["assignedTo"]>]);
  });
  const assigneeOptions = Array.from(new Map(assigneePairs).entries());
  const hasActiveFilter =
    filterStatus !== "" ||
    filterAssigneeId !== "" ||
    filterPriority !== "" ||
    filterDue !== "all" ||
    colorFilter !== null;

  const visibleStatusColumns = useMemo(
    () => STATUS_LIST.filter((s) => columnVisible[s.value]),
    [columnVisible]
  );

  const mindmapSourceTasks = useMemo(() => {
    if (view !== "mindmap") return tasks;
    if (mindmapMode === "all") return [];
    if (mindmapMode === "project" || mindmapMode === "unassigned") {
      return Array.isArray(mindmapScopedTasksRaw) ? mindmapScopedTasksRaw : [];
    }
    return tasks;
  }, [view, mindmapMode, mindmapScopedTasksRaw, tasks]);

  const mindmapScopeFilteredTasks = useMemo(() => {
    if (!currentUserId || projectScopeFilter === "all") return mindmapSourceTasks;
    if (projectScopeFilter === "mine") {
      return mindmapSourceTasks.filter((t) => taskIsMine(t, currentUserId));
    }
    return mindmapSourceTasks.filter((t) => taskIsSharedParticipation(t, currentUserId));
  }, [mindmapSourceTasks, projectScopeFilter, currentUserId]);

  const mindmapFilteredTasks = useMemo(() => {
    return mindmapScopeFilteredTasks.filter((t: Task) => {
      if (filterStatus && getEffectiveStatus(t) !== filterStatus) return false;
      if (
        filterAssigneeId &&
        t.assignedTo?.id !== filterAssigneeId &&
        !(t.assignees?.some((a) => a.id === filterAssigneeId))
      )
        return false;
      if (filterPriority && normPriority(t.priority) !== filterPriority) return false;
      if (!passesDueFilter(t, filterDue)) return false;
      if (colorFilter === COLOR_FILTER_DEFAULT_ONLY) {
        if (taskHasPaletteColor(t.color)) return false;
      } else if (colorFilter && (t.color ?? null) !== colorFilter) return false;
      return true;
    });
  }, [
    mindmapScopeFilteredTasks,
    filterStatus,
    filterAssigneeId,
    filterPriority,
    filterDue,
    colorFilter,
  ]);

  const mindmapTasks = useMemo(() => {
    return mindmapFilteredTasks.map((t: any) => ({
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
      categoryId: t.categoryId ?? null,
      assignees: t.assignees,
      assignedTo: t.assignees?.[0] ?? t.assignedTo,
      createdById: t.createdById ?? t.createdBy?.id ?? null,
      color: t.color ?? null,
      completedAt: t.completedAt ?? null,
      archivedAt: t.archivedAt ?? null,
      defaultCollapsed: !!t.defaultCollapsed,
    }));
  }, [mindmapFilteredTasks]);

  const mindmapTaskIdSet = useMemo(() => new Set(mindmapTasks.map((t: { id: string }) => t.id)), [mindmapTasks]);

  const mindmapLinksForView = useMemo(
    () =>
      taskLinks.filter(
        (l) => mindmapTaskIdSet.has(l.parentId) && mindmapTaskIdSet.has(l.childId)
      ),
    [taskLinks, mindmapTaskIdSet]
  );

  const mindmapCanvasId = mindmapCanvasIdFromMode(mindmapMode, mindmapProjectId);

  const mindmapProjectPicker = useMemo(
    () =>
      (projectMindmapSummaries as { id: string; name: string; brand?: { name: string } }[]).map((p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
      })),
    [projectMindmapSummaries]
  );

  const mindmapBlockLoading = useMemo(() => {
    if (view !== "mindmap") return false;
    if (mindmapMode === "all") {
      return projectMindmapLoading && projectMindmapSummaries.length === 0;
    }
    if (mindmapMode === "project" && !mindmapProjectId) return true;
    if (mindmapScopedLoading) return true;
    if (linksLoading) return true;
    return false;
  }, [
    view,
    mindmapMode,
    mindmapProjectId,
    projectMindmapLoading,
    projectMindmapSummaries.length,
    mindmapScopedLoading,
    linksLoading,
  ]);

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
              : "프로젝트를 목록·Mindmap·Daily Report로 관리합니다. 카드 클릭 시 오른쪽에서 미리 볼 수 있고, Ctrl·⌘·Shift 클릭은 새 탭으로 열립니다."
          }
        />
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={view} onValueChange={(v: any) => setView(v as any)} className="w-auto">
            <TabsList className="bg-muted/50 h-9 rounded-lg border border-gray-200 p-0.5" data-tour="tasks-view-tabs">
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
          {view === "list" && projectsViewModeReady ? (
            <div
              className="flex items-center rounded-md border border-gray-200"
              role="group"
              aria-label="목록 표시 방식"
            >
              <button
                type="button"
                title="보드 뷰"
                onClick={() => setProjectsViewModePersisted("board")}
                className={cn(
                  "rounded-l-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/80",
                  projectsViewMode === "board" && "bg-muted text-foreground"
                )}
              >
                <LayoutGrid className="size-4" />
              </button>
              <button
                type="button"
                title="테이블 뷰"
                onClick={() => setProjectsViewModePersisted("table")}
                className={cn(
                  "rounded-r-md border-l border-gray-200 p-1.5 text-muted-foreground transition-colors hover:bg-muted/80",
                  projectsViewMode === "table" && "bg-muted text-foreground"
                )}
              >
                <ListTableIcon className="size-4" />
              </button>
            </div>
          ) : null}
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
              {isTasksAdmin && (
                <Select
                  value={adminTasksUserId || "__all_staff__"}
                  onValueChange={(v) => setAdminTasksUserId(v === "__all_staff__" ? "" : v)}
                >
                  <SelectTrigger className="h-9 w-[148px] border-gray-200 text-left text-sm">
                    <SelectValue placeholder="직원" />
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectItem value="__all_staff__">전체 직원</SelectItem>
                    {(tasksAdminUsers as { id: string; name: string }[]).map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {formatUserName(u)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
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
                      setColorFilter(null);
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
        {(() => {
          const inner = (
            <>
        {(view === "list" || view === "mindmap") && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-muted/10 px-3 py-2">
            <span className="text-muted-foreground text-xs font-medium">색상</span>
            <button
              type="button"
              onClick={() => setColorFilter(null)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                colorFilter === null ? "border-gray-800 bg-gray-800 text-white" : "border-gray-200 hover:bg-muted"
              )}
            >
              전체
            </button>
            <button
              type="button"
              title="팔레트 미지정·기본 테두리"
              onClick={() =>
                setColorFilter((prev) =>
                  prev === COLOR_FILTER_DEFAULT_ONLY ? null : COLOR_FILTER_DEFAULT_ONLY
                )
              }
              className={cn(
                "rounded-full border-2 border-dashed px-2.5 py-0.5 text-xs transition-colors",
                colorFilter === COLOR_FILTER_DEFAULT_ONLY
                  ? "border-gray-800 bg-gray-100 text-gray-900"
                  : "border-gray-300 text-muted-foreground hover:bg-muted"
              )}
            >
              기본
            </button>
            {PROJECT_TASK_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.label}
                onClick={() => setColorFilter(colorFilter === c.value ? null : c.value)}
                className={cn(
                  "size-6 shrink-0 rounded-full border-2 transition-transform",
                  colorFilter === c.value ? "scale-110 border-gray-800" : "border-transparent hover:scale-105"
                )}
                style={{ background: c.value }}
              />
            ))}
          </div>
        )}
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
              {isTasksAdmin && (
                <Select
                  value={adminTasksUserId || "__all_staff__"}
                  onValueChange={(v) => setAdminTasksUserId(v === "__all_staff__" ? "" : v)}
                >
                  <SelectTrigger className="h-9 w-full min-w-[160px] border-gray-200 sm:w-[200px]" size="sm">
                    <SelectValue placeholder="직원별 보기" />
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectItem value="__all_staff__">전체 직원</SelectItem>
                    {(tasksAdminUsers as { id: string; name: string }[]).map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {formatUserName(u)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex w-full flex-col gap-2 border-t border-gray-200 pt-3 sm:flex-row sm:items-center sm:gap-3">
              <span className="text-muted-foreground shrink-0 text-xs font-semibold tracking-wide">
                완료·아카이브
              </span>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={taskCompletionShelf === "active" ? "default" : "outline"}
                  className="h-8 border-gray-200 text-xs"
                  onClick={() => setTaskCompletionShelf("active")}
                >
                  활성만
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={taskCompletionShelf === "recent" ? "default" : "outline"}
                  className="h-8 border-gray-200 text-xs"
                  onClick={() => setTaskCompletionShelf("recent")}
                >
                  최근 완료 7일
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={taskCompletionShelf === "all" ? "default" : "outline"}
                  className="h-8 border-gray-200 text-xs"
                  onClick={() => setTaskCompletionShelf("all")}
                >
                  전체+아카이브
                </Button>
              </div>
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
          ) : mindmapBlockLoading ? (
            <div className="min-h-[480px] w-full space-y-3 rounded-xl border bg-muted/10 p-4">
              <Skeleton className="h-8 w-64 rounded-md" />
              <Skeleton className="h-[420px] w-full rounded-lg" />
            </div>
          ) : (
            <div key="mindmap" className="min-h-[480px] w-full min-w-0">
              <TaskTreeView
                toolbarPortalEl={mindmapToolbarHost}
                tasks={mindmapTasks as any}
                taskLinks={mindmapLinksForView as any}
                onRefresh={refreshTasks}
                onTaskClick={(taskId: string) => {
                  openTaskPeek(taskId);
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
                mindmapMode={mindmapMode}
                mindmapCanvasId={mindmapCanvasId}
                projectSummaries={mindmapMode === "all" ? (projectMindmapSummaries as any) : []}
                projectPicker={mindmapProjectPicker}
                onMindmapNavigate={onMindmapNavigate}
                contextProjectId={mindmapMode === "project" ? mindmapProjectId : null}
                taskCompletionShelf={taskCompletionShelf}
                onTaskCompletionShelfChange={setTaskCompletionShelf}
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
          {projectsViewMode === "table" ? (
            <ProjectTableView
              tasks={filteredTasks}
              getEffectiveStatus={getEffectiveStatus}
              statusLabel={statusLabel}
              priorityLabel={priorityLabel}
              priorityVariant={priorityVariant}
              onActivateTask={openTaskPeek}
              canDeleteTask={canDeleteTask}
              onDeleteTask={(id) => {
                void handleDeleteTask(id);
              }}
              deletingTaskId={deletingTaskId}
              splitPeekTaskId={splitPeekTaskId}
              isMdUp={isMdUp}
            />
          ) : (
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
                              splitPeekTaskId === task.id && isMdUp && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                            )}
                            style={{
                              borderLeftWidth: 4,
                              borderLeftColor: getTaskCardAccentColor(task.color),
                            }}
                          >
                            <Link
                              href={`/tasks/${task.id}`}
                              prefetch={false} // [PERF-claude-code] 카드마다 RSC 프리패치 방지
                              className="block w-full px-3 pt-3 text-left outline-none"
                              onClick={(e) => {
                                if (!isPlainLeftClick(e)) return;
                                e.preventDefault();
                                openTaskPeek(task.id);
                              }}
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
                                  {task.dueDate
                                    ? format(new Date(task.dueDate), "M월 d일", { locale: ko })
                                    : "마감 미정"}
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
          )}
          {projectsViewMode === "board" && hasMoreTasksPaged ? (
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
          ) : null}
          </div>
        )}
            </>
          );
          return isMdUp && view !== "log" ? (
            <SplitView
              className="min-h-[min(85vh,calc(100vh-11rem))] w-full max-w-full"
              defaultSplit={0.5}
              fixedHalfSplit
              list={
                <div className="flex min-h-0 max-h-[min(85vh,calc(100vh-11rem))] flex-col overflow-y-auto pr-1">
                  {inner}
                </div>
              }
              detail={
                splitPeekTaskId ? (
                  <TaskDetailContent taskId={splitPeekTaskId} onUpdate={onTasksDetailUpdated} />
                ) : null
              }
              onClose={() => setSplitPeekTaskId(null)}
            />
          ) : (
            inner
          );
        })()}
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
        defaultProjectId={view === "mindmap" && mindmapMode === "project" ? mindmapProjectId : null}
      />
      <TaskDetailDrawer
        taskId={peekTaskId}
        onClose={() => setPeekTaskId(null)}
        onUpdate={onTasksDetailUpdated}
        narrow={view === "mindmap"}
      />
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <p className="text-muted-foreground">불러오는 중...</p>
        </div>
      }
    >
      <TasksPageInner />
    </Suspense>
  );
}
