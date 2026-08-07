"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { differenceInCalendarDays, format, startOfDay } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import { TaskAssigneeAvatars } from "@/components/task-assignee-avatars";
import { cn } from "@/lib/utils";
import { workspaceFetchHeaders } from "@/lib/workspace-fetch-headers";

export type ScheduleListTask = {
  id: string;
  title: string;
  dueDate: string | null;
  isCompleted: boolean;
  priority?: string;
  assignees?: { id: string; name: string; position?: string | null; image?: string | null }[];
  assignedTo: { id?: string; name: string; position?: string | null; image?: string | null } | null;
};

type DueTone = "overdue" | "today" | "soon" | "later" | "none";

type DueMeta = {
  tone: DueTone;
  /** 정렬: 0 지연 → 1 오늘 → 2 임박 → 3 이후 → 4 미정 */
  sortKey: number;
  /** 뱃지 라벨 (날짜 옆) */
  badge: string;
  /** 회색 날짜 텍스트 (later만 날짜, none은 미정 뱃지만) */
  dateLabel: string | null;
};

const UNDO_MS = 1500;

function dueMeta(dueDate: string | null, now = new Date()): DueMeta {
  if (!dueDate) {
    return { tone: "none", sortKey: 4, badge: "미정", dateLabel: null };
  }
  const due = startOfDay(new Date(dueDate));
  const today = startOfDay(now);
  const diff = differenceInCalendarDays(due, today);
  const dateLabel = format(due, "MM/dd", { locale: ko });
  if (diff < 0) {
    return { tone: "overdue", sortKey: 0, badge: `D+${Math.abs(diff)}`, dateLabel };
  }
  if (diff === 0) {
    return { tone: "today", sortKey: 1, badge: "D-DAY", dateLabel };
  }
  if (diff <= 3) {
    return { tone: "soon", sortKey: 2, badge: `D-${diff}`, dateLabel };
  }
  return { tone: "later", sortKey: 3, badge: dateLabel, dateLabel };
}

function dueBadgeClass(tone: DueTone): string {
  switch (tone) {
    case "overdue":
      return "border-transparent bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300";
    case "today":
      return "border-transparent bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300";
    case "soon":
      return "border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
    case "none":
      return "border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground";
    default:
      return "border-transparent bg-muted text-muted-foreground";
  }
}

export function sortScheduleTasks(tasks: ScheduleListTask[]): ScheduleListTask[] {
  return [...tasks].sort((a, b) => {
    const ma = dueMeta(a.dueDate);
    const mb = dueMeta(b.dueDate);
    if (ma.sortKey !== mb.sortKey) return ma.sortKey - mb.sortKey;
    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    }
    return a.title.localeCompare(b.title, "ko");
  });
}

export function summarizeScheduleTasks(tasks: ScheduleListTask[]) {
  let overdue = 0;
  let today = 0;
  for (const t of tasks) {
    const m = dueMeta(t.dueDate);
    if (m.tone === "overdue") overdue += 1;
    else if (m.tone === "today") today += 1;
  }
  return { total: tasks.length, overdue, today };
}

type Props = {
  tasks: ScheduleListTask[];
  /** 완료 반영 후 SWR 등 재검증 */
  onCompleted: (taskId: string) => void | Promise<void>;
  emptyHint?: ReactNode;
  className?: string;
  listClassName?: string;
  /** 상세 링크 라벨 */
  detailLabel?: string;
  /** 목록 표시 상한 (요약 카운트는 전체 기준) */
  maxItems?: number;
  /** 상한 초과 시 더보기 링크 */
  moreHref?: string;
  moreLabel?: string;
};

export function ScheduleTaskList({
  tasks,
  onCompleted,
  emptyHint,
  className,
  listClassName,
  detailLabel = "상세",
  maxItems,
  moreHref,
  moreLabel = "할일 페이지로 →",
}: Props) {
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [removingIds, setRemovingIds] = useState<Set<string>>(() => new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const sorted = useMemo(() => sortScheduleTasks(tasks), [tasks]);
  const summary = useMemo(() => summarizeScheduleTasks(tasks), [tasks]);
  const visible = useMemo(
    () => (maxItems != null && maxItems > 0 ? sorted.slice(0, maxItems) : sorted),
    [sorted, maxItems]
  );
  const hiddenCount = Math.max(0, sorted.length - visible.length);

  const clearTimer = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t) clearTimeout(t);
    timersRef.current.delete(id);
  }, []);

  useEffect(() => {
    return () => {
      for (const t of timersRef.current.values()) clearTimeout(t);
      timersRef.current.clear();
    };
  }, []);

  const commitComplete = useCallback(
    async (taskId: string) => {
      try {
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          credentials: "include",
          headers: workspaceFetchHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ status: "DONE", isCompleted: true }),
        });
        if (res.status === 403) {
          throw new Error("forbidden");
        }
        if (!res.ok) {
          throw new Error("failed");
        }
        setRemovingIds((prev) => {
          const next = new Set(prev);
          next.add(taskId);
          return next;
        });
        // 페이드 후 목록에서 제거
        window.setTimeout(() => {
          void onCompleted(taskId);
          setPendingIds((prev) => {
            const next = new Set(prev);
            next.delete(taskId);
            return next;
          });
          setRemovingIds((prev) => {
            const next = new Set(prev);
            next.delete(taskId);
            return next;
          });
        }, 220);
      } catch (e) {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
        if (e instanceof Error && e.message === "forbidden") {
          toast.error("이 할일을 완료할 권한이 없습니다.");
        } else {
          toast.error("완료 처리에 실패했습니다. 다시 시도해 주세요.");
        }
      }
    },
    [onCompleted]
  );

  const cancelPending = useCallback(
    (taskId: string) => {
      clearTimer(taskId);
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    },
    [clearTimer]
  );

  const startPendingComplete = useCallback(
    (taskId: string) => {
      if (pendingIds.has(taskId) || removingIds.has(taskId)) return;
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.add(taskId);
        return next;
      });
      clearTimer(taskId);
      const timer = setTimeout(() => {
        timersRef.current.delete(taskId);
        void commitComplete(taskId);
      }, UNDO_MS);
      timersRef.current.set(taskId, timer);
    },
    [pendingIds, removingIds, clearTimer, commitComplete]
  );

  if (sorted.length === 0) {
    return (
      <div className={className}>
        {emptyHint ?? (
          <p className="text-muted-foreground py-4 text-center text-sm">표시할 할일이 없습니다.</p>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="text-muted-foreground mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span>
          전체 <span className="font-semibold text-foreground">{summary.total}</span>
        </span>
        {summary.overdue > 0 ? (
          <>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">
              지연 {summary.overdue}
            </span>
          </>
        ) : null}
        <span aria-hidden>·</span>
        <span>
          오늘 <span className="font-semibold text-foreground">{summary.today}</span>
        </span>
      </p>
      <ul className={cn("space-y-2", listClassName)}>
        {visible.map((t) => {
          const meta = dueMeta(t.dueDate);
          const pending = pendingIds.has(t.id);
          const removing = removingIds.has(t.id);
          const struck = pending || removing || t.isCompleted;
          return (
            <li
              key={t.id}
              className={cn(
                "flex flex-wrap items-center gap-2 rounded-md border border-emerald-900/10 bg-emerald-50/40 px-3 py-2 transition-all duration-200 dark:border-emerald-900/30 dark:bg-emerald-950/20",
                struck && "opacity-55",
                removing && "scale-[0.98] opacity-0"
              )}
            >
              <input
                type="checkbox"
                checked={struck}
                disabled={removing}
                className="size-4 shrink-0 cursor-pointer rounded"
                aria-label={`${t.title} 완료`}
                onClick={(e) => e.stopPropagation()}
                onChange={() => {
                  if (pending) {
                    cancelPending(t.id);
                    return;
                  }
                  if (!struck) startPendingComplete(t.id);
                }}
              />
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <Link
                  href={`/tasks/${t.id}`}
                  prefetch={false}
                  className={cn(
                    "min-w-0 flex-1 text-sm hover:underline",
                    struck && "text-muted-foreground line-through"
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  {t.title}
                </Link>
                <TaskAssigneeAvatars
                  assignees={t.assignees}
                  assignedTo={
                    t.assignedTo
                      ? { id: t.assignedTo.id ?? "legacy", name: t.assignedTo.name, position: t.assignedTo.position, image: t.assignedTo.image }
                      : null
                  }
                  size={22}
                  maxVisible={2}
                  className="shrink-0"
                />
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums",
                    dueBadgeClass(meta.tone)
                  )}
                  title={t.dueDate ? format(new Date(t.dueDate), "yyyy.MM.dd", { locale: ko }) : "마감 미정"}
                >
                  {meta.badge}
                </span>
              </div>
              {pending && !removing ? (
                <button
                  type="button"
                  className="shrink-0 text-xs font-medium text-emerald-800 underline underline-offset-2 hover:no-underline dark:text-emerald-300"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    cancelPending(t.id);
                  }}
                >
                  실행취소
                </button>
              ) : (
                <Link
                  href={`/tasks/${t.id}`}
                  prefetch={false}
                  className="shrink-0 text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                  onClick={(e) => e.stopPropagation()}
                >
                  {detailLabel}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {hiddenCount > 0 && moreHref ? (
        <p className="mt-2">
          <Link
            href={moreHref}
            prefetch={false}
            className="text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300"
          >
            {moreLabel} ({hiddenCount}건 더)
          </Link>
        </p>
      ) : null}
    </div>
  );
}
