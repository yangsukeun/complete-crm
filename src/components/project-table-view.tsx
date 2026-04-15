"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format, isBefore, startOfDay } from "date-fns";
import { ko } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TaskAssigneeAvatars } from "@/components/task-assignee-avatars";
import { formatUserName, cn } from "@/lib/utils";
import { isPlainLeftClick } from "@/lib/peek-navigation";
import { ExternalLink, Trash2 } from "lucide-react";
import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";

export type ProjectTableTaskStatus = "TODO" | "IN_PROGRESS" | "DONE";

export type ProjectTableTask = {
  id: string;
  title: string;
  dueDate: string;
  isCompleted: boolean;
  status?: ProjectTableTaskStatus | null;
  priority: string;
  assignees?: {
    id: string;
    name: string;
    email: string;
    position?: string | null;
    image?: string | null;
  }[];
  assignedTo: {
    id: string;
    name: string;
    email: string;
    position?: string | null;
    image?: string | null;
  } | null;
  createdById?: string | null;
  createdBy?: { id: string; name: string; position?: string | null };
  color?: string | null;
};

type SortKey = "title" | "status" | "assignee" | "dueDate" | "priority" | "progress";
type SortDir = "asc" | "desc";

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

function progressForTask(task: ProjectTableTask, effective: ProjectTableTaskStatus): number {
  if (task.isCompleted || effective === "DONE") return 100;
  if (effective === "IN_PROGRESS") return 50;
  return 0;
}

function assigneeSortKey(task: ProjectTableTask): string {
  if (task.assignees?.length) {
    return task.assignees.map((a) => formatUserName(a)).join(", ");
  }
  if (task.assignedTo) return formatUserName(task.assignedTo);
  return "";
}

const STATUS_BADGE_CLASS: Record<ProjectTableTaskStatus, string> = {
  TODO: "border-sky-600 bg-sky-50 text-sky-900 dark:bg-sky-950/50 dark:text-sky-100",
  IN_PROGRESS: "border-amber-600 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100",
  DONE: "border-emerald-600 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100",
};

export type ProjectTableViewProps<T extends ProjectTableTask = ProjectTableTask> = {
  tasks: T[];
  getEffectiveStatus: (t: T) => ProjectTableTaskStatus;
  statusLabel: (s: ProjectTableTaskStatus) => string;
  priorityLabel: (priority: string) => string;
  priorityVariant: (priority: string) => BadgeVariant;
  onActivateTask: (taskId: string) => void;
  canDeleteTask: (t: T) => boolean;
  onDeleteTask: (taskId: string) => void;
  deletingTaskId: string | null;
  splitPeekTaskId: string | null;
  isMdUp: boolean;
};

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <TableHead className="whitespace-nowrap">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
      >
        {label}
        {active ? <span className="text-muted-foreground text-xs tabular-nums">{dir === "asc" ? "↑" : "↓"}</span> : null}
      </button>
    </TableHead>
  );
}

export function ProjectTableView<T extends ProjectTableTask = ProjectTableTask>({
  tasks,
  getEffectiveStatus,
  statusLabel,
  priorityLabel,
  priorityVariant,
  onActivateTask,
  canDeleteTask,
  onDeleteTask,
  deletingTaskId,
  splitPeekTaskId,
  isMdUp,
}: ProjectTableViewProps<T>) {
  const [sortKey, setSortKey] = useState<SortKey>("dueDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSortClick = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = useMemo(() => {
    const list = [...tasks];
    const mult = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const sa = getEffectiveStatus(a);
      const sb = getEffectiveStatus(b);
      switch (sortKey) {
        case "title":
          return mult * a.title.localeCompare(b.title, "ko");
        case "status": {
          const o: Record<ProjectTableTaskStatus, number> = { TODO: 0, IN_PROGRESS: 1, DONE: 2 };
          return mult * (o[sa] - o[sb]);
        }
        case "assignee":
          return mult * assigneeSortKey(a).localeCompare(assigneeSortKey(b), "ko");
        case "dueDate": {
          const ta = new Date(a.dueDate).getTime();
          const tb = new Date(b.dueDate).getTime();
          return mult * (ta - tb);
        }
        case "priority": {
          const rank = (p: string) => (p === "HIGH" ? 0 : p === "LOW" ? 2 : 1);
          return mult * (rank(a.priority) - rank(b.priority));
        }
        case "progress":
          return mult * (progressForTask(a, sa) - progressForTask(b, sb));
        default:
          return 0;
      }
    });
    return list;
  }, [tasks, sortKey, sortDir, getEffectiveStatus]);

  const todayStart = startOfDay(new Date());

  return (
    <div className="rounded-md border">
      <div className="overflow-x-auto">
        <Table className="min-w-[720px] text-sm">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <SortHeader
                label="프로젝트명"
                active={sortKey === "title"}
                dir={sortDir}
                onClick={() => handleSortClick("title")}
              />
              <SortHeader
                label="상태"
                active={sortKey === "status"}
                dir={sortDir}
                onClick={() => handleSortClick("status")}
              />
              <SortHeader
                label="담당자"
                active={sortKey === "assignee"}
                dir={sortDir}
                onClick={() => handleSortClick("assignee")}
              />
              <SortHeader
                label="마감일"
                active={sortKey === "dueDate"}
                dir={sortDir}
                onClick={() => handleSortClick("dueDate")}
              />
              <SortHeader
                label="우선순위"
                active={sortKey === "priority"}
                dir={sortDir}
                onClick={() => handleSortClick("priority")}
              />
              <SortHeader
                label="진행률"
                active={sortKey === "progress"}
                dir={sortDir}
                onClick={() => handleSortClick("progress")}
              />
              <TableHead className="w-[120px] text-right font-medium">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-10 text-center">
                  표시할 프로젝트가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((task) => {
                const eff = getEffectiveStatus(task);
                const due = new Date(task.dueDate);
                const overdue = !task.isCompleted && isBefore(due, todayStart);
                const progress = progressForTask(task, eff);
                return (
                  <TableRow
                    key={task.id}
                    className={cn(
                      "border-b",
                      splitPeekTaskId === task.id && isMdUp && "bg-primary/5"
                    )}
                    style={task.color ? { borderLeftWidth: 4, borderLeftColor: task.color } : undefined}
                  >
                    <TableCell className="max-w-[220px]">
                      <Link
                        href={`/tasks/${task.id}`}
                        prefetch={false}
                        className="block truncate font-medium text-primary hover:underline"
                        onClick={(e) => {
                          if (!isPlainLeftClick(e)) return;
                          e.preventDefault();
                          onActivateTask(task.id);
                        }}
                      >
                        {task.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-xs font-medium", STATUS_BADGE_CLASS[eff])}>
                        {statusLabel(eff)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2">
                        <TaskAssigneeAvatars assignees={task.assignees} assignedTo={task.assignedTo} size={24} />
                        <span className="text-muted-foreground truncate text-xs">
                          {assigneeSortKey(task) || "미지정"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className={cn("whitespace-nowrap tabular-nums", overdue && "font-medium text-destructive")}>
                      {format(due, "yyyy.MM.dd", { locale: ko })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={priorityVariant(task.priority)} className="text-[10px]">
                        {priorityLabel(task.priority)}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{progress}%</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            onActivateTask(task.id);
                          }}
                        >
                          <ExternalLink className="size-3.5" />
                          상세
                        </Button>
                        {canDeleteTask(task) ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            title="삭제(휴지통)"
                            disabled={deletingTaskId === task.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteTask(task.id);
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
