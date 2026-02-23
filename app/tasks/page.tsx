"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { useSession } from "next-auth/react";
import { useWorkspaceStore } from "@/store/workspace-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CreateTaskModal } from "@/components/create-task-modal";
import { TaskDetailDrawer } from "@/components/task-detail-drawer";
import { TaskCategoryTree } from "@/components/task-category-tree";
import { PageHeadline } from "@/components/page-headline";
import { toast } from "sonner";
import { Plus, LayoutGrid, List, Filter, GitBranch, FileText } from "lucide-react";
import { TaskTreeView } from "./components/view-tree";
import { WorkLogTab } from "./components/work-log-tab";
import { formatUserName } from "@/lib/utils";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { cn } from "@/lib/utils";

const STATUS_LIST = [
  { value: "TODO", label: "할 일" },
  { value: "IN_PROGRESS", label: "진행 중" },
  { value: "DONE", label: "완료" },
] as const;

type TaskStatus = (typeof STATUS_LIST)[number]["value"];

type Task = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string;
  isCompleted: boolean;
  status?: TaskStatus | null;
  priority: string;
  parentId: string | null;
  categoryId: string | null;
  orderIndex: number;
  assignedTo: { id: string; name: string; email: string; position?: string | null };
  createdBy: { id: string; name: string; position?: string | null };
  attachments?: { id: string }[];
  comments?: { id: string }[];
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

type TaskLink = {
  id: string;
  parentId: string;
  childId: string;
};

type CategoryItem = { id: string; name: string; parentId: string | null; sortOrder: number; isCollapsed: boolean };

function tasksFetcher(key: unknown): Promise<Task[]> {
  const [url, workspace] = Array.isArray(key) && key.length >= 2 ? key : [];
  if (!url || !workspace) return Promise.resolve([]);
  return fetch(url, { headers: { "x-workspace": String(workspace) } }).then((r) => (r.ok ? r.json() : []));
}
function categoriesFetcher(key: unknown): Promise<CategoryItem[]> {
  const [url, workspace] = Array.isArray(key) && key.length >= 2 ? key : [];
  if (!url || !workspace) return Promise.resolve([]);
  return fetch(url, { headers: { "x-workspace": String(workspace) } }).then((r) => (r.ok ? r.json() : []));
}
function linksFetcher(key: unknown): Promise<TaskLink[]> {
  const [url, workspace] = Array.isArray(key) && key.length >= 2 ? key : [];
  if (!url || !workspace) return Promise.resolve([]);
  return fetch(url, { headers: { "x-workspace": String(workspace) } }).then((r) => (r.ok ? r.json() : []));
}

export default function TasksPage() {
  const searchParams = useSearchParams();
  const { data: session, status: authStatus } = useSession();
  const { mutate: globalMutate } = useSWRConfig();
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);

  const urlMode = searchParams.get("mode");
  const mode: "TEAM" | "MY" = urlMode === "MY" || urlMode === "TEAM" ? urlMode : currentWorkspace;

  useEffect(() => {
    if (urlMode === "MY" || urlMode === "TEAM") setWorkspace(urlMode);
  }, [urlMode, setWorkspace]);

  const [view, setView] = useState<"board" | "table" | "tree" | "logs">("board");
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const taskKey: [string, string] = ["/api/tasks", mode];
  const catKey: [string, string] = ["/api/tasks/categories", mode];
  const linksKey: [string, string] = ["/api/tasks/links", mode];

  const { data: tasksData = [], mutate: mutateTasks, isLoading: tasksLoading } = useSWR<Task[]>(
    authStatus === "authenticated" ? taskKey : null,
    tasksFetcher,
    { keepPreviousData: true }
  );
  const { data: categoriesData = [], mutate: mutateCategories } = useSWR<CategoryItem[]>(
    authStatus === "authenticated" ? catKey : null,
    categoriesFetcher,
    { keepPreviousData: true }
  );
  const { data: taskLinksData = [], mutate: mutateLinks } = useSWR<TaskLink[]>(
    authStatus === "authenticated" ? linksKey : null,
    linksFetcher,
    { keepPreviousData: true }
  );

  const tasks = Array.isArray(tasksData) ? tasksData : [];
  const categories = Array.isArray(categoriesData) ? categoriesData : [];
  const taskLinks = Array.isArray(taskLinksData) ? taskLinksData : [];

  const refreshTasks = useCallback(() => {
    mutateTasks();
    mutateCategories();
    mutateLinks();
  }, [mutateTasks, mutateCategories, mutateLinks]);

  useEffect(() => {
    const onPrefetch = (e: Event) => {
      const w = (e as CustomEvent<{ workspace: "TEAM" | "MY" }>).detail?.workspace;
      if (!w) return;
      globalMutate(["/api/tasks", w], tasksFetcher);
      globalMutate(["/api/tasks/categories", w], categoriesFetcher);
      globalMutate(["/api/tasks/links", w], linksFetcher);
    };
    window.addEventListener("workspace-prefetch", onPrefetch);
    return () => window.removeEventListener("workspace-prefetch", onPrefetch);
  }, [globalMutate]);

  const updateTaskStatus = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    setUpdatingStatusId(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          isCompleted: newStatus === "DONE",
        }),
      });
      if (!res.ok) throw new Error("Failed to update");
      mutateTasks();
      toast.success("상태가 변경되었습니다.");
    } catch {
      toast.error("상태 변경에 실패했습니다.");
    } finally {
      setUpdatingStatusId(null);
    }
  }, [mutateTasks]);

  const handleDragEnd = useCallback(
    (result: { destination?: { droppableId: string }; draggableId: string }) => {
      if (!result.destination) return;
      const newStatus = result.destination.droppableId as TaskStatus;
      const taskId = result.draggableId;
      if (getEffectiveStatus(tasks.find((t) => t.id === taskId)!) !== newStatus) {
        updateTaskStatus(taskId, newStatus);
      }
    },
    [tasks, updateTaskStatus]
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

  const tasksByStatus = {
    TODO: tasks.filter((t) => getEffectiveStatus(t) === "TODO"),
    IN_PROGRESS: tasks.filter((t) => getEffectiveStatus(t) === "IN_PROGRESS"),
    DONE: tasks.filter((t) => getEffectiveStatus(t) === "DONE"),
  };

  return (
    <div key={mode} className="flex flex-col gap-6 p-6 md:p-8">
      {/* Notion-style header */}
      <div className="border-border flex flex-col gap-4 border-b border-gray-200 pb-6">
        <PageHeadline title="업무" />
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            value={view}
            onValueChange={(v) => setView(v as "board" | "table" | "tree" | "logs")}
            className="w-auto"
          >
            <TabsList className="bg-muted/50 h-9 rounded-lg border border-gray-200 p-0.5">
              <TabsTrigger value="board" className="gap-2 rounded-md px-3">
                <LayoutGrid className="size-4" />
                보드
              </TabsTrigger>
              <TabsTrigger value="table" className="gap-2 rounded-md px-3">
                <List className="size-4" />
                리스트
              </TabsTrigger>
              <TabsTrigger value="tree" className="gap-2 rounded-md px-3">
                <GitBranch className="size-4" />
                트리
              </TabsTrigger>
              <TabsTrigger value="logs" className="gap-2 rounded-md px-3">
                <FileText className="size-4" />
                일지
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" className="border-gray-200 text-muted-foreground">
            <Filter className="mr-2 size-4" />
            필터
          </Button>
          <Button
            onClick={() => setCreateOpen(true)}
            className="ml-auto bg-foreground text-background hover:bg-foreground/90"
          >
            <Plus className="mr-2 size-4" />
            새로 만들기
          </Button>
        </div>
      </div>

      {/* 모드가 바뀌면 이 블록 전체를 파괴 후 재생성해 데이터를 확실히 갱신 */}
      <div key={mode}>
      {tasksLoading && tasks.length === 0 && view !== "logs" ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          업무 목록을 불러오는 중...
        </p>
      ) : view === "logs" ? (
        <WorkLogTab />
      ) : tasks.length === 0 ? (
        <div className="border-border rounded-lg border border-dashed border-gray-200 bg-muted/20 py-16 text-center text-muted-foreground">
          <p className="mb-4 text-sm">업무가 없습니다.</p>
          <Button onClick={() => setCreateOpen(true)} variant="outline" size="sm">
            <Plus className="mr-2 size-4" />
            새로 만들기
          </Button>
        </div>
      ) : view === "tree" ? (
        <TaskTreeView
          tasks={tasks.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            dueDate: t.dueDate,
            isCompleted: t.isCompleted,
            status: t.status,
            priority: t.priority,
            parentId: t.parentId,
            isCollapsed: false,
            assignedTo: t.assignedTo,
          }))}
          taskLinks={taskLinks}
          onRefresh={refreshTasks}
          onTaskClick={(taskId) => setDetailTaskId(taskId)}
          onCreateTask={(parentId) => {
            setCreateParentId(parentId);
            setCreateOpen(true);
          }}
        />
      ) : view === "board" ? (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {STATUS_LIST.map(({ value, label }) => (
              <div
                key={value}
                className="border-border flex flex-col rounded-lg border border-gray-200 bg-muted/20"
              >
                <div className="border-border flex items-center justify-between border-b border-gray-200 px-4 py-3">
                  <span className="text-sm font-medium text-foreground">{label}</span>
                  <span className="text-muted-foreground text-xs">
                    {tasksByStatus[value].length}개
                  </span>
                </div>
                <Droppable droppableId={value}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        "min-h-[120px] flex-1 space-y-2 p-3 transition-colors",
                        snapshot.isDraggingOver && "bg-muted/40"
                      )}
                    >
                      {tasksByStatus[value].map((task, index) => (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              onClick={() => setDetailTaskId(task.id)}
                              className="border-border cursor-pointer rounded-lg border border-gray-200 bg-card p-3 shadow-sm transition-shadow hover:shadow-md"
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
                                <Avatar className="h-6 w-6">
                                  <AvatarFallback className="text-[10px]">
                                    {(task.assignedTo.name ?? "?").slice(0, 1)}
                                  </AvatarFallback>
                                </Avatar>
                                <Badge variant={priorityVariant(task.priority)} className="text-[10px]">
                                  {priorityLabel(task.priority)}
                                </Badge>
                                <span className="text-muted-foreground text-xs">
                                  {format(new Date(task.dueDate), "M월 d일", { locale: ko })}
                                </span>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      ) : (
        <div className="border-border overflow-hidden rounded-lg border border-gray-200">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-200 hover:bg-transparent">
                <TableHead className="text-muted-foreground font-medium">제목</TableHead>
                <TableHead className="text-muted-foreground w-[120px] font-medium">상태</TableHead>
                <TableHead className="text-muted-foreground w-[90px] font-medium">우선순위</TableHead>
                <TableHead className="text-muted-foreground w-[110px] font-medium">마감일</TableHead>
                <TableHead className="text-muted-foreground w-[100px] font-medium">담당자</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                <TableRow
                  key={task.id}
                  className="border-gray-200 cursor-pointer transition-colors hover:bg-muted/50"
                  onClick={() => setDetailTaskId(task.id)}
                >
                  <TableCell>
                    <span
                      className={cn(
                        "font-medium",
                        task.isCompleted && "text-muted-foreground line-through"
                      )}
                    >
                      {task.title}
                    </span>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={getEffectiveStatus(task)}
                      onValueChange={(v) => updateTaskStatus(task.id, v as TaskStatus)}
                      disabled={updatingStatusId === task.id}
                    >
                      <SelectTrigger className="h-8 border-gray-200 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_LIST.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant={priorityVariant(task.priority)} className="text-xs">
                      {priorityLabel(task.priority)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(task.dueDate), "yyyy년 M월 d일", { locale: ko })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[10px]">
                          {(task.assignedTo.name ?? "?").slice(0, 1)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{formatUserName(task.assignedTo)}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 스킬트리 (대분류) */}
      <TaskCategoryTree
        categories={categories}
        tasks={tasks.map((t) => ({
          id: t.id,
          title: t.title,
          dueDate: t.dueDate,
          isCompleted: t.isCompleted,
          status: t.status,
          priority: t.priority,
          categoryId: t.categoryId ?? null,
          assignedTo: t.assignedTo,
        }))}
        onRefresh={refreshTasks}
        defaultAssignedToId={session?.user?.id ?? null}
      />
      </div>

      <CreateTaskModal
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateParentId(null);
        }}
        onCreated={() => {
          refreshTasks();
          setCreateOpen(false);
          setCreateParentId(null);
        }}
        parentId={createParentId}
        orderIndex={tasks.length}
      />

      <TaskDetailDrawer
        taskId={detailTaskId}
        onClose={() => setDetailTaskId(null)}
        onUpdate={refreshTasks}
      />
    </div>
  );
}
