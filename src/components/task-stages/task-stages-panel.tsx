"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { CheckCircle2, Circle, ListOrdered, Loader2, Pencil, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StageActionBox } from "./stage-action-box";
import { StageEditor } from "./stage-editor";
import { StageProgressBar } from "./stage-progress-bar";
import { STAGE_STATUS_CLASS, STAGE_STATUS_LABEL, stageFetch, type StageView, type TaskStagesResponse } from "./types";

function StageIcon({ status }: { status: StageView["status"] }) {
  if (status === "DONE") return <CheckCircle2 className="size-4 text-emerald-600" />;
  if (status === "ACTIVE") return <PlayCircle className="size-4 text-sky-600" />;
  return <Circle className="size-4 text-gray-300" />;
}

/** 프로젝트 상세의 "단계" 영역: 단계 진행 현황 + 내 담당 단계 저장/완료 + 단계 편집 */
export function TaskStagesPanel({ taskId, onChanged }: { taskId: string; onChanged?: () => void }) {
  const { data: session } = useSession();
  const myId = session?.user?.id ?? "";
  const [data, setData] = useState<TaskStagesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    stageFetch<TaskStagesResponse>(`/api/tasks/${taskId}/stages`)
      .then((next) => {
        if (cancelled) return;
        setError(null);
        setData(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "단계를 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, reloadKey]);

  const refresh = () => {
    setReloadKey((k) => k + 1);
    onChanged?.();
  };

  if (error) return <p className="text-sm text-muted-foreground">{error}</p>;
  if (!data) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        단계를 불러오는 중…
      </p>
    );
  }

  if (editing) {
    return (
      <StageEditor
        taskId={taskId}
        data={data}
        onCancel={() => setEditing(false)}
        onSaved={(next) => {
          setData(next);
          setEditing(false);
          onChanged?.();
        }}
      />
    );
  }

  if (data.stages.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 p-4 text-center text-sm text-muted-foreground">
        <ListOrdered className="mx-auto mb-2 size-5" />
        아직 단계가 없습니다. 프로젝트를 단계로 나누고 단계별 담당자를 정하면, 단계가 시작될 때 담당자에게 알림이 갑니다.
        {data.canEdit && (
          <div className="mt-3">
            <Button type="button" size="sm" onClick={() => setEditing(true)}>
              단계 만들기
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <StageProgressBar value={data.overallProgress} className="min-w-40 flex-1" />
        <Link href="/stages" className="text-xs text-sky-700 hover:underline">
          전체 진행 현황
        </Link>
        {data.canEdit && (
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
            단계 편집
          </Button>
        )}
      </div>

      <ol className="space-y-2">
        {data.stages.map((s) => {
          const mine = s.assignees.find((a) => a.userId === myId);
          return (
            <li key={s.id} className={cn("rounded-md border p-3", s.status === "ACTIVE" ? "border-sky-300 bg-white shadow-sm" : "border-gray-200 bg-white")}>
              <div className="flex flex-wrap items-center gap-2">
                <StageIcon status={s.status} />
                <span className="text-sm font-semibold">
                  {s.number}단계 · {s.name}
                </span>
                <span className={cn("rounded-full border px-2 py-0.5 text-[11px]", STAGE_STATUS_CLASS[s.status])}>
                  {STAGE_STATUS_LABEL[s.status]}
                </span>
                {s.status !== "PENDING" && (
                  <span className="text-xs text-muted-foreground">
                    담당자 {s.doneCount}/{s.assignees.length} 완료
                  </span>
                )}
                <StageProgressBar value={s.progress} className="ml-auto w-40" />
              </div>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {s.assignees.map((a) => (
                  <li key={a.userId}>
                    <Link
                      href={`/stages/${a.userId}`}
                      title={a.lastNote ? `최근 메모: ${a.lastNote}` : "담당자 페이지 보기"}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-gray-50",
                        a.completedAt ? "border-emerald-200 text-emerald-800" : "border-gray-200 text-gray-800"
                      )}
                    >
                      {a.completedAt && <CheckCircle2 className="size-3" />}
                      {a.name}
                      {s.status === "ACTIVE" && !a.completedAt && <span className="tabular-nums text-muted-foreground">{a.progress}%</span>}
                    </Link>
                  </li>
                ))}
              </ul>
              {s.status === "ACTIVE" && mine && (
                <div className="mt-2">
                  <StageActionBox
                    key={`${s.id}-${mine.completedAt ?? "open"}`}
                    stageId={s.id}
                    myProgress={mine.progress}
                    myCompletedAt={mine.completedAt}
                    onChanged={refresh}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
