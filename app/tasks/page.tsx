"use client";

import React, { Component, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeadline } from "@/components/page-headline";
import { toast } from "sonner";
import { Plus, Filter, GitBranch, FileText, List as ListIcon } from "lucide-react";
import { formatUserName } from "@/lib/utils";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const TaskTreeView = dynamic(
  () => import("./components/view-tree").then((m) => m.TaskTreeView),
  {
    ssr: false,
    loading: () => (
      <p className="text-muted-foreground py-12 text-center text-sm">
        마인드맵 불러오는 중...
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
        업무일지 불러오는 중...
      </p>
    ),
  }
);

const CreateTaskModal = dynamic(
  () => import("@/components/create-task-modal").then((m) => m.CreateTaskModal),
  { ssr: false }
);

const STATUS_LIST = [
  { value: "TODO", label: "준비" },
  { value: "IN_PROGRESS", label: "진행중" },
  { value: "DONE", label: "완료" },
] as const;

type TaskStatus = (typeof STATUS_LIST)[number]["value"];

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
  assignedTo: { id: string; name: string; email: string; position?: string | null };
  createdBy: { id: string; name: string; position?: string | null };
};

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

function tasksFetcher(url: string): Promise<Task[]> {
  return fetch(url).then((r: any) => (r.ok ? r.json() : []));
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
  const [view, setView] = useState<"list" | "mindmap" | "log">("list");
  const [mindmapMounted, setMindmapMounted] = useState(false);

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

  const { data: tasksData = [], mutate: mutateTasks, isLoading: tasksLoading } = useSWR<Task[]>(
    authStatus === "authenticated" ? "/api/tasks" : null,
    tasksFetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 12_000,
    }
  );

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

  const tasks = Array.isArray(tasksData) ? tasksData : [];
  const taskLinks = Array.isArray(linksData) ? linksData : [];

  const refreshTasks = useCallback(() => {
    mutateTasks();
    mutateLinks();
  }, [mutateTasks, mutateLinks]);

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

  if (authStatus === "loading" || authStatus === "unauthenticated") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">
          {authStatus === "unauthenticated" ? "로그인이 필요합니다." : "불러오는 중..."}
        </p>
      </div>
    );
  }

  const filteredTasks = tasks.filter((t: any) => {
    if (filterStatus && getEffectiveStatus(t) !== filterStatus) return false;
    if (filterAssigneeId && t.assignedTo?.id !== filterAssigneeId) return false;
    return true;
  });
  const assigneePairs = tasks
    .map((t: any) => [t.assignedTo?.id, t.assignedTo] as [string | undefined, unknown])
    .filter((pair): pair is [string, unknown] => pair[0] != null && !!pair[1]);
  const assigneeOptions = Array.from(new Map(assigneePairs).entries());
  const hasActiveFilter = filterStatus !== "" || filterAssigneeId !== "";

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
      assignedTo: t.assignedTo,
    }));
  }, [filteredTasks]);

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div className="border-border flex flex-col gap-4 border-b border-gray-200 pb-6">
        <PageHeadline title="업무" description="업무를 목록·마인드맵·업무일지로 관리합니다." />
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={view} onValueChange={(v: any) => setView(v as any)} className="w-auto">
            <TabsList className="bg-muted/50 h-9 rounded-lg border border-gray-200 p-0.5">
              <TabsTrigger value="list" className="gap-2 rounded-md px-3">
                <ListIcon className="size-4" />
                todoo
              </TabsTrigger>
              <TabsTrigger value="mindmap" className="gap-2 rounded-md px-3">
                <GitBranch className="size-4" />
                마인드맵
              </TabsTrigger>
              <TabsTrigger value="log" className="gap-2 rounded-md px-3">
                <FileText className="size-4" />
                업무일지
              </TabsTrigger>
            </TabsList>
            <TabsContent value="list" className="mt-0" />
            <TabsContent value="mindmap" className="mt-0" />
            <TabsContent value="log" className="mt-0" />
          </Tabs>
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
            <PopoverContent className="w-64" align="start">
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setFilterStatus("");
                    setFilterAssigneeId("");
                  }}
                >
                  필터 초기화
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            onClick={() => {
              setCreateParentId(null);
              setCreateOpen(true);
            }}
            className="ml-auto bg-foreground text-background hover:bg-foreground/90"
          >
            <Plus className="mr-2 size-4" />
            새로 만들기
          </Button>
        </div>
      </div>

      <ViewErrorBoundary key={view}>
        {view === "log" ? (
          <WorkLogTab />
        ) : view === "mindmap" ? (
          !mindmapMounted ? (
            <p className="text-muted-foreground py-12 text-center text-sm">마인드맵 준비 중...</p>
          ) : tasksLoading && tasks.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">업무 목록을 불러오는 중...</p>
          ) : linksLoading ? (
            <p className="text-muted-foreground py-12 text-center text-sm">연결 정보를 불러오는 중...</p>
          ) : (
            <div key="mindmap" className="min-h-[480px] w-full">
              <TaskTreeView
                tasks={mindmapTasks as any}
                taskLinks={taskLinks as any}
                onRefresh={refreshTasks}
                onTaskClick={(taskId: string) => router.push(`/tasks/${taskId}`)}
                onCreateTask={(parentId: any) => {
                  setCreateParentId(parentId);
                  setCreateOpen(true);
                }}
              />
            </div>
          )
        ) : tasksLoading && tasks.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">업무 목록을 불러오는 중...</p>
        ) : filteredTasks.length === 0 ? (
          <div className="border-border rounded-lg border border-dashed border-gray-200 bg-muted/20 py-16 text-center text-muted-foreground">
            <p className="mb-4 text-sm">업무가 없습니다.</p>
            <Button
              onClick={() => {
                setCreateParentId(null);
                setCreateOpen(true);
              }}
              variant="outline"
              size="sm"
            >
              <Plus className="mr-2 size-4" />
              새로 만들기
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {STATUS_LIST.map((col) => {
              const list = filteredTasks.filter((t: any) => getEffectiveStatus(t) === col.value);
              return (
                <div key={col.value} className="border-border flex flex-col rounded-lg border border-gray-200 bg-muted/20">
                  <div className="border-border flex items-center justify-between border-b border-gray-200 px-4 py-3">
                    <span className="text-sm font-medium text-foreground">{col.label}</span>
                    <span className="text-muted-foreground text-xs">{list.length}개</span>
                  </div>
                  <div className="flex-1 space-y-2 p-3">
                    {list.length === 0 ? (
                      <p className="text-muted-foreground py-6 text-center text-xs">없음</p>
                    ) : (
                      list.map((task: any) => {
                        const s = getEffectiveStatus(task);
                        const prev = s === "DONE" ? "IN_PROGRESS" : s === "IN_PROGRESS" ? "TODO" : null;
                        const next = s === "TODO" ? "IN_PROGRESS" : s === "IN_PROGRESS" ? "DONE" : null;
                        return (
                          <div
                            key={task.id}
                            className="border-border rounded-lg border border-gray-200 bg-card p-3 shadow-sm"
                          >
                            <button
                              type="button"
                              onClick={() => router.push(`/tasks/${task.id}`)}
                              className="w-full text-left"
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
                                <span className="text-muted-foreground text-xs">
                                  {format(new Date(task.dueDate), "M월 d일", { locale: ko })}
                                </span>
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <Avatar className="h-6 w-6">
                                  <AvatarFallback className="text-[10px]">
                                    {(task.assignedTo?.name ?? "?").slice(0, 1)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-muted-foreground text-xs">
                                  {formatUserName(task.assignedTo)}
                                </span>
                              </div>
                            </button>
                            <div className="mt-3 flex items-center gap-2">
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
        orderIndex={tasks.length}
        defaultAssignedToId={(session?.user as any)?.id ?? null}
      />
    </div>
  );
}
