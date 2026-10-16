"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FolderOpen, Loader2, RefreshCw, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StageProgressBar } from "@/components/task-stages/stage-progress-bar";
import { STAGE_STATUS_CLASS, STAGE_STATUS_LABEL, stageFetch, type StageView } from "@/components/task-stages/types";
import { cn } from "@/lib/utils";

type OverviewProject = {
  taskId: string;
  title: string;
  dueDate: string | null;
  createdBy: { id: string; name: string } | null;
  folderUrl: string | null;
  overallProgress: number;
  allDone: boolean;
  activeStageNumber: number | null;
  stages: StageView[];
};

type AssigneeSummary = { userId: string; name: string; position: string | null; active: number; pending: number };

export function StagesOverviewClient() {
  const [projects, setProjects] = useState<OverviewProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeDone, setIncludeDone] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const d = await stageFetch<{ projects: OverviewProject[] }>(`/api/task-stages/overview${includeDone ? "?done=1" : ""}`);
      setProjects(d.projects);
    } catch (e) {
      setError(e instanceof Error ? e.message : "진행 현황을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [includeDone]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!projects || !term) return projects ?? [];
    return projects.filter(
      (p) =>
        p.title.toLowerCase().includes(term) ||
        p.stages.some((s) => s.name.toLowerCase().includes(term) || s.assignees.some((a) => a.name.toLowerCase().includes(term)))
    );
  }, [projects, q]);

  /** 담당자별 요약: 진행 중·대기 단계 수 */
  const assignees = useMemo(() => {
    const map = new Map<string, AssigneeSummary>();
    for (const p of projects ?? []) {
      for (const s of p.stages) {
        for (const a of s.assignees) {
          const cur = map.get(a.userId) ?? { userId: a.userId, name: a.name, position: a.position, active: 0, pending: 0 };
          if (s.status === "ACTIVE" && !a.completedAt) cur.active++;
          if (s.status === "PENDING") cur.pending++;
          map.set(a.userId, cur);
        }
      }
    }
    return [...map.values()].sort((x, y) => y.active - x.active || x.name.localeCompare(y.name, "ko"));
  }, [projects]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="프로젝트·단계·담당자 검색" className="h-8 w-64 text-sm" />
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input type="checkbox" checked={includeDone} onChange={(e) => setIncludeDone(e.target.checked)} />
          완료된 프로젝트도 보기
        </label>
        <Link href="/stages/me" className="ml-auto">
          <Button type="button" variant="outline" size="sm" className="gap-1.5">
            <UserRound className="size-4" />
            내 담당 단계
          </Button>
        </Link>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={loading} onClick={() => void load()}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          새로고침
        </Button>
      </div>

      {assignees.length > 0 && (
        <section aria-label="담당자별 현황" className="flex flex-wrap gap-2">
          {assignees.map((a) => (
            <Link
              key={a.userId}
              href={`/stages/${a.userId}`}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm hover:border-sky-300 hover:bg-sky-50"
            >
              <span className="font-medium">{a.position ? `${a.name} ${a.position}` : a.name}</span>
              <span className={cn("text-xs", a.active > 0 ? "text-sky-700" : "text-muted-foreground")}>진행 {a.active}</span>
              <span className="text-xs text-muted-foreground">대기 {a.pending}</span>
            </Link>
          ))}
        </section>
      )}

      {error && <p className="text-sm text-rose-700">{error}</p>}
      {!projects && !error && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          불러오는 중…
        </p>
      )}
      {projects && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 px-4 py-12 text-center text-sm text-muted-foreground">
          단계가 있는 프로젝트가 없습니다. 프로젝트 상세의 「단계」에서 단계를 만들어 보세요.
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {filtered.map((p) => (
          <li key={p.taskId} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Link href={`/tasks/${p.taskId}#stages`} className="text-base font-semibold text-gray-900 hover:underline">
                {p.title}
              </Link>
              {p.allDone ? (
                <span className="flex items-center gap-1 text-xs text-emerald-700">
                  <CheckCircle2 className="size-3.5" />
                  모든 단계 완료
                </span>
              ) : (
                <span className="text-xs text-sky-700">
                  {p.activeStageNumber}/{p.stages.length}단계 진행 중
                </span>
              )}
              {p.dueDate && <span className="text-xs text-muted-foreground">마감 {new Date(p.dueDate).toLocaleDateString("ko")}</span>}
              {p.folderUrl && (
                <Link href={p.folderUrl} prefetch={false} className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline">
                  <FolderOpen className="size-3.5" />
                  자료 폴더
                </Link>
              )}
              <StageProgressBar value={p.overallProgress} className="ml-auto w-48" />
            </div>

            <ol className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
              {p.stages.map((s) => (
                <li key={s.id} className={cn("rounded-md border p-2", STAGE_STATUS_CLASS[s.status])}>
                  <div className="flex items-center gap-1 text-xs font-semibold">
                    <span>
                      {s.number}. {s.name}
                    </span>
                    <span className="ml-auto font-normal">{STAGE_STATUS_LABEL[s.status]}</span>
                  </div>
                  <ul className="mt-1.5 flex flex-wrap gap-1">
                    {s.assignees.map((a) => (
                      <li key={a.userId}>
                        <Link
                          href={`/stages/${a.userId}`}
                          title={a.lastNote ? `최근 메모: ${a.lastNote}` : "담당자 페이지 보기"}
                          className="inline-flex items-center gap-0.5 rounded-full bg-white/80 px-1.5 py-0.5 text-[11px] text-gray-800 hover:underline"
                        >
                          {a.completedAt && <CheckCircle2 className="size-3 text-emerald-600" />}
                          {a.name}
                          {s.status === "ACTIVE" && !a.completedAt && <span className="text-muted-foreground">{a.progress}%</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </div>
  );
}
