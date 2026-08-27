"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import { differenceInCalendarDays, format, startOfDay } from "date-fns";
import { ko } from "date-fns/locale";
import { Calendar, ListTodo, Target } from "lucide-react";
import { jsonFetcher } from "@/lib/api-swr";
import { cn } from "@/lib/utils";
import { ScheduleTaskList, type ScheduleListTask } from "@/components/schedule-task-list";
import { useGoogleTasksSync } from "@/hooks/use-google-tasks-sync";

type BriefSchedule = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  source: "crm" | "google";
};

type BriefProject = {
  id: string;
  name: string;
  dueDate: string;
  brandName: string | null;
};

type BriefResponse = {
  dateYmd: string;
  schedules: BriefSchedule[];
  tasks: ScheduleListTask[];
  projects: BriefProject[];
  projectMeta?: { overdue: number; soon: number; withDueDate: number };
};

function projectDueBadge(dueDate: string) {
  const due = startOfDay(new Date(dueDate));
  const today = startOfDay(new Date());
  const diff = differenceInCalendarDays(due, today);
  if (diff < 0) {
    return { label: `D+${Math.abs(diff)}`, className: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" };
  }
  if (diff === 0) {
    return { label: "D-DAY", className: "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300" };
  }
  return { label: `D-${diff}`, className: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" };
}

function formatHeaderDate(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00+09:00`);
  return format(d, "M월 d일 EEEE", { locale: ko });
}

export function DashboardTodayBrief() {
  const { data, mutate, isLoading } = useSWR<BriefResponse>("/api/dashboard/brief", jsonFetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
  });
  useGoogleTasksSync({ auto: true, onSynced: () => void mutate() });

  const handleTaskCompleted = useCallback(
    async (taskId: string) => {
      await mutate(
        (prev) => {
          if (!prev) return prev;
          return { ...prev, tasks: prev.tasks.filter((t) => t.id !== taskId) };
        },
        { revalidate: true }
      );
    },
    [mutate]
  );

  const empty = useMemo(() => {
    if (!data) return false;
    return data.schedules.length === 0 && data.tasks.length === 0 && data.projects.length === 0;
  }, [data]);

  const visibleProjects = useMemo(() => (data?.projects ?? []).slice(0, 5), [data?.projects]);
  const hiddenProjects = Math.max(0, (data?.projects.length ?? 0) - visibleProjects.length);

  if (isLoading && !data) {
    return <div className="h-28 animate-pulse rounded-lg bg-muted/40" />;
  }
  if (!data) return null;

  if (empty) {
    return (
      <section className="rounded-lg border bg-card px-4 py-3">
        <h2 className="text-base font-semibold tracking-tight">{formatHeaderDate(data.dateYmd)}</h2>
        <p className="text-muted-foreground mt-1 text-sm">오늘 마감 없음</p>
      </section>
    );
  }

  const meta = data.projectMeta;

  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm">
      <h2 className="mb-4 text-base font-semibold tracking-tight">{formatHeaderDate(data.dateYmd)}</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-2">
          <h3 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
            <Calendar className="size-3.5" />
            오늘 일정
          </h3>
          {data.schedules.length === 0 ? (
            <p className="text-muted-foreground text-sm">일정 없음</p>
          ) : (
            <ul className="space-y-1.5">
              {data.schedules.map((s) => (
                <li key={s.id}>
                  <Link
                    href="/schedule"
                    prefetch={false}
                    className="flex items-baseline gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted/50"
                  >
                    <span className="text-muted-foreground w-12 shrink-0 tabular-nums text-xs">
                      {s.allDay ? "종일" : format(new Date(s.start), "HH:mm")}
                    </span>
                    <span className="min-w-0 truncate font-medium">{s.title}</span>
                    {s.source === "google" ? (
                      <span className="text-muted-foreground shrink-0 text-[10px]">G</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0 space-y-2">
          <h3 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
            <ListTodo className="size-3.5" />
            할일
          </h3>
          <ScheduleTaskList
            tasks={data.tasks}
            onCompleted={handleTaskCompleted}
            maxItems={5}
            moreHref="/schedule"
            moreLabel="할일 목록으로 →"
            listClassName="max-h-64 overflow-y-auto"
            emptyHint={<p className="text-muted-foreground text-sm">표시할 할일 없음</p>}
          />
        </div>

        <div className="min-w-0 space-y-2">
          <h3 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
            <Target className="size-3.5" />
            프로젝트 마감
          </h3>
          {meta && (meta.overdue > 0 || meta.soon > 0) ? (
            <p className="text-muted-foreground text-xs">
              {meta.overdue > 0 ? (
                <span className="mr-2 inline-flex rounded-full bg-red-100 px-1.5 py-0.5 font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">
                  지연 {meta.overdue}
                </span>
              ) : null}
              <span>
                임박 <span className="font-semibold text-foreground">{meta.soon}</span>
              </span>
            </p>
          ) : null}
          {data.projects.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {meta && meta.withDueDate === 0
                ? "마감일이 설정된 담당 프로젝트 없음"
                : "지연·임박 프로젝트 없음"}
            </p>
          ) : (
            <>
              <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                {visibleProjects.map((p) => {
                  const badge = projectDueBadge(p.dueDate);
                  return (
                    <li key={p.id}>
                      <Link
                        href={`/projects/${p.id}`}
                        prefetch={false}
                        className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm hover:bg-muted/40"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {p.brandName ? `${p.brandName} · ` : ""}
                          {p.name}
                        </span>
                        <span
                          className={cn(
                            "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            badge.className
                          )}
                        >
                          {badge.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {hiddenProjects > 0 ? (
                <Link
                  href="/tasks"
                  prefetch={false}
                  className="text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                >
                  프로젝트 더보기 ({hiddenProjects}건)
                </Link>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
