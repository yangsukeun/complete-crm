"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskAssigneeAvatars } from "@/components/task-assignee-avatars";
import { getTaskCardAccentColor } from "@/lib/project-task-colors";
import { isPlainLeftClick } from "@/lib/peek-navigation";
import { cn, formatUserName } from "@/lib/utils";
import type { ProjectTableTask, ProjectTableTaskStatus } from "@/components/project-table-view";
import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

const STATUS_PILL: Record<ProjectTableTaskStatus, string> = {
  TODO: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
  IN_PROGRESS: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
  DONE: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
};

/**
 * 칸반 카드보다 훑기 쉬운 한 줄 목록.
 * 제목·상태·담당·마감을 한 행에 두고, 클릭하면 기존과 같이 미리보기를 연다.
 */
export function ProjectListView<T extends ProjectTableTask>({
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
}: {
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
}) {
  if (tasks.length === 0) return null;

  return (
    <ul className="bg-card divide-y overflow-hidden rounded-xl border">
      {tasks.map((task) => {
        const status = getEffectiveStatus(task);
        const accent = getTaskCardAccentColor(task.color);
        const selected = splitPeekTaskId === task.id && isMdUp;
        return (
          <li key={task.id}>
            <Link
              href={`/tasks/${task.id}`}
              prefetch={false}
              className={cn(
                "hover:bg-muted/50 flex items-center gap-2.5 px-3 py-2 outline-none transition-colors",
                selected && "bg-muted/70"
              )}
              style={{ borderLeft: `3px solid ${accent}` }}
              onClick={(e) => {
                if (!isPlainLeftClick(e)) return;
                e.preventDefault();
                onActivateTask(task.id);
              }}
            >
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                  STATUS_PILL[status]
                )}
              >
                {statusLabel(status)}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm font-medium",
                  task.isCompleted && "text-muted-foreground line-through"
                )}
              >
                {task.title}
              </span>
              <Badge variant={priorityVariant(task.priority)} className="hidden shrink-0 text-[10px] sm:inline-flex">
                {priorityLabel(task.priority)}
              </Badge>
              <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                <TaskAssigneeAvatars
                  assignees={task.assignees}
                  assignedTo={task.assignedTo}
                  size={20}
                />
                <span className="text-muted-foreground max-w-[7rem] truncate text-xs">
                  {task.assignees?.length
                    ? task.assignees.map((a) => formatUserName(a)).join(", ")
                    : task.assignedTo
                      ? formatUserName(task.assignedTo)
                      : "미지정"}
                </span>
              </span>
              <span className="text-muted-foreground w-[4.5rem] shrink-0 text-right text-xs tabular-nums">
                {task.dueDate
                  ? format(new Date(task.dueDate), "M.d", { locale: ko })
                  : "—"}
              </span>
              {canDeleteTask(task) ? (
                <span onClick={(e) => e.preventDefault()} className="inline-flex shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive size-7"
                    title="삭제(휴지통)"
                    disabled={deletingTaskId === task.id}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDeleteTask(task.id);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </span>
              ) : (
                <span className="size-7 shrink-0" />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
