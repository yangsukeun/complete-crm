"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { CreateTaskModal } from "@/components/create-task-modal";
import { PageHeadline } from "@/components/page-headline";
import { toast } from "sonner";
import { Plus, Filter } from "lucide-react";
import { formatUserName } from "@/lib/utils";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
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

function tasksFetcher(url: string): Promise<Task[]> {
  return fetch(url).then((r: any) => (r.ok ? r.json() : []));
}

export default function TasksPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "">("");
  const [filterAssigneeId, setFilterAssigneeId] = useState<string>("");

  const { data: tasksData = [], mutate: mutateTasks, isLoading: tasksLoading } = useSWR<Task[]>(
    authStatus === "authenticated" ? "/api/tasks" : null,
    tasksFetcher,
    { keepPreviousData: true, revalidateOnFocus: false, dedupingInterval: 5000 }
  );

  const tasks = Array.isArray(tasksData) ? tasksData : [];

  const refreshTasks = useCallback(() => {
    mutateTasks();
  }, [mutateTasks]);

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

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div className="border-border flex flex-col gap-4 border-b border-gray-200 pb-6">
        <PageHeadline title="업무" description="업무를 목록으로 보고, 상태와 담당자를 관리합니다." />
        <div className="flex flex-wrap items-center gap-3">
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
            onClick={() => setCreateOpen(true)}
            className="ml-auto bg-foreground text-background hover:bg-foreground/90"
          >
            <Plus className="mr-2 size-4" />
            새로 만들기
          </Button>
        </div>
      </div>

      {tasksLoading && tasks.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center text-sm">업무 목록을 불러오는 중...</p>
      ) : filteredTasks.length === 0 ? (
        <div className="border-border rounded-lg border border-dashed border-gray-200 bg-muted/20 py-16 text-center text-muted-foreground">
          <p className="mb-4 text-sm">업무가 없습니다.</p>
          <Button onClick={() => setCreateOpen(true)} variant="outline" size="sm">
            <Plus className="mr-2 size-4" />
            새로 만들기
          </Button>
        </div>
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
              {filteredTasks.map((task: any) => (
                <TableRow
                  key={task.id}
                  className="border-gray-200 cursor-pointer transition-colors hover:bg-muted/50"
                  onClick={() => router.push(`/tasks/${task.id}`)}
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
                  <TableCell onClick={(e: any) => e.stopPropagation()}>
                    <Select
                      value={getEffectiveStatus(task)}
                      onValueChange={(v: any) => updateTaskStatus(task.id, v as TaskStatus)}
                      disabled={updatingStatusId === task.id}
                    >
                      <SelectTrigger className="h-8 border-gray-200 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_LIST.map((s: any) => (
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
                          {(task.assignedTo?.name ?? "?").slice(0, 1)}
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

      <CreateTaskModal
        open={createOpen}
        onOpenChange={(open: any) => {
          setCreateOpen(open);
        }}
        onCreated={() => {
          refreshTasks();
          setCreateOpen(false);
        }}
      />
    </div>
  );
}
