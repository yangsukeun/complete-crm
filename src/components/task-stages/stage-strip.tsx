"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { StageProgressBar } from "./stage-progress-bar";
import { stageFetch, type TaskStagesResponse } from "./types";

/** 단계 패널·저장/완료 버튼이 바뀌면 보내는 이벤트. 상단 단계 띠가 듣고 다시 불러온다 */
export const STAGES_CHANGED_EVENT = "task-stages-changed";

export function notifyStagesChanged(taskId: string) {
  window.dispatchEvent(new CustomEvent(STAGES_CHANGED_EVENT, { detail: { taskId } }));
}

/**
 * 프로젝트 창 맨 위에 붙는 단계 띠: 전체 단계 흐름 + 지금 단계·담당자·완료 인원.
 * 단계가 없으면 아무것도 그리지 않는다. onOpenStages 를 주면 "단계 보기"로 이동한다.
 */
export function StageStrip({
  taskId,
  onOpenStages,
  folderUrl,
}: {
  taskId: string;
  onOpenStages?: () => void;
  /** 프로젝트 자료 폴더(/drive?folder=…). 있으면 "자료 폴더" 버튼을 보여 준다 */
  folderUrl?: string | null;
}) {
  const [data, setData] = useState<TaskStagesResponse | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const onChanged = (e: Event) => {
      if ((e as CustomEvent<{ taskId?: string }>).detail?.taskId === taskId) setReloadKey((k) => k + 1);
    };
    window.addEventListener(STAGES_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(STAGES_CHANGED_EVENT, onChanged);
  }, [taskId]);

  useEffect(() => {
    let cancelled = false;
    stageFetch<TaskStagesResponse>(`/api/tasks/${taskId}/stages`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, reloadKey]);

  if (!data || data.stages.length === 0) return null;
  const active = data.stages.find((s) => s.status === "ACTIVE");
  const allDone = data.stages.every((s) => s.status === "DONE");

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold text-sky-900">
          {allDone ? `${data.stages.length}단계 모두 완료` : active ? `${active.number}/${data.stages.length}단계 진행 중` : "단계"}
        </span>
        {active && (
          <span className="min-w-0 truncate text-gray-800">
            {active.name}
            <span className="ml-2 text-xs text-muted-foreground">
              담당 {active.assignees.map((a) => `${a.name}${a.completedAt ? "✓" : ""}`).join(", ")} · {active.doneCount}/{active.assignees.length} 완료
            </span>
          </span>
        )}
        <StageProgressBar value={data.overallProgress} className="ml-auto w-36" />
        {folderUrl && (
          <Link href={folderUrl} prefetch={false} className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline">
            <FolderOpen className="size-3.5" />
            자료 폴더
          </Link>
        )}
        {onOpenStages && (
          <button type="button" className="text-xs font-medium text-sky-700 hover:underline" onClick={onOpenStages}>
            단계 보기
          </button>
        )}
      </div>
      <ol className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
        {data.stages.map((s) => (
          <li
            key={s.id}
            title={`${s.number}. ${s.name}\n담당: ${s.assignees.map((a) => a.name).join(", ")}`}
            className={cn(
              "flex min-w-[88px] max-w-[160px] flex-1 items-center gap-1 rounded-md border px-1.5 py-1 text-[11px]",
              s.status === "DONE" && "border-emerald-200 bg-emerald-50 text-emerald-800",
              s.status === "ACTIVE" && "border-sky-400 bg-white font-semibold text-sky-900 shadow-sm",
              s.status === "PENDING" && "border-gray-200 bg-white/60 text-gray-500"
            )}
          >
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-full text-[10px]",
                s.status === "DONE" ? "bg-emerald-500 text-white" : s.status === "ACTIVE" ? "bg-sky-500 text-white" : "bg-gray-200 text-gray-600"
              )}
            >
              {s.status === "DONE" ? <Check className="size-3" /> : s.number}
            </span>
            <span className="truncate">{s.name.replace(/\s*\([^)]*\)\s*$/, "")}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
