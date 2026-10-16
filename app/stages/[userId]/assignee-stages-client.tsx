"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { PageHeadline } from "@/components/page-headline";
import { StageActionBox } from "@/components/task-stages/stage-action-box";
import { StageProgressBar } from "@/components/task-stages/stage-progress-bar";
import { STAGE_STATUS_CLASS, STAGE_STATUS_LABEL, stageFetch, type StageView } from "@/components/task-stages/types";
import { cn } from "@/lib/utils";

type Item = {
  task: { id: string; title: string; dueDate: string | null };
  totalStages: number;
  stage: StageView;
  mine: { progress: number; lastNote: string | null; lastSavedAt: string | null; completedAt: string | null };
};

type AssigneeData = {
  user: { id: string; name: string; position: string | null; department: string | null };
  isMe: boolean;
  active: Item[];
  pending: Item[];
  done: Item[];
};

function StageCard({ item, isMe, onChanged }: { item: Item; isMe: boolean; onChanged: () => void }) {
  const { task, stage, mine, totalStages } = item;
  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/tasks/${task.id}#stages`} className="font-semibold text-gray-900 hover:underline">
          {task.title}
        </Link>
        <span className={cn("rounded-full border px-2 py-0.5 text-[11px]", STAGE_STATUS_CLASS[stage.status])}>
          {stage.number}/{totalStages}단계 · {stage.name} · {STAGE_STATUS_LABEL[stage.status]}
        </span>
        {task.dueDate && <span className="text-xs text-muted-foreground">마감 {new Date(task.dueDate).toLocaleDateString("ko")}</span>}
        <StageProgressBar value={mine.progress} className="ml-auto w-40" />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        단계 담당자: {stage.assignees.map((a) => `${a.name}${a.completedAt ? "(완료)" : ""}`).join(", ")}
      </p>
      {mine.lastNote && (
        <p className="mt-1 text-sm text-gray-800">
          <span className="text-xs text-muted-foreground">
            최근 메모{mine.lastSavedAt ? ` (${format(new Date(mine.lastSavedAt), "M월 d일 HH:mm", { locale: ko })})` : ""}:{" "}
          </span>
          {mine.lastNote}
        </p>
      )}
      {isMe && stage.status === "ACTIVE" && (
        <div className="mt-3">
          <StageActionBox
            key={`${stage.id}-${mine.completedAt ?? "open"}`}
            stageId={stage.id}
            myProgress={mine.progress}
            myCompletedAt={mine.completedAt}
            onChanged={onChanged}
          />
        </div>
      )}
      {stage.status === "DONE" && stage.completedAt && (
        <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
          <CheckCircle2 className="size-3.5" />
          {format(new Date(stage.completedAt), "yyyy.M.d", { locale: ko })} 단계 완료
        </p>
      )}
    </li>
  );
}

function Section({ title, items, empty, isMe, onChanged }: { title: string; items: Item[]; empty: string; isMe: boolean; onChanged: () => void }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-gray-900">
        {title} <span className="font-normal text-muted-foreground">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <StageCard key={it.stage.id} item={it} isMe={isMe} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** 담당자 페이지: 한 직원이 맡은 단계(진행 중·대기·완료). 본인이면 저장·완료를 여기서 바로 한다 */
export function AssigneeStagesClient({ userId }: { userId: string }) {
  const [data, setData] = useState<AssigneeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    stageFetch<AssigneeData>(`/api/task-stages/assignee/${encodeURIComponent(userId)}`)
      .then((next) => {
        if (cancelled) return;
        setError(null);
        setData(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "담당 단계를 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  if (error) return <p className="text-sm text-rose-700">{error}</p>;
  if (!data) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        불러오는 중…
      </p>
    );
  }

  const who = data.user.position ? `${data.user.name} ${data.user.position}` : data.user.name;
  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/stages" className="flex w-fit items-center gap-1 text-sm text-sky-700 hover:underline">
          <ArrowLeft className="size-4" />
          전체 진행 현황
        </Link>
        <PageHeadline
          title={data.isMe ? "내 담당 단계" : `${who} 담당 단계`}
          description={
            data.isMe
              ? "지금 진행 중인 단계에서 진행 내용을 저장하고, 맡은 일을 마치면 완료를 누르세요. 담당자가 모두 완료하면 다음 단계로 넘어갑니다."
              : `${data.user.department ? `${data.user.department} · ` : ""}이 직원이 맡은 단계와 진행 상황입니다.`
          }
        />
      </div>
      <Section title="진행 중" items={data.active} empty="지금 진행 중인 단계가 없습니다." isMe={data.isMe} onChanged={() => void load()} />
      <Section title="대기 (앞 단계가 끝나면 시작)" items={data.pending} empty="대기 중인 단계가 없습니다." isMe={data.isMe} onChanged={() => void load()} />
      <Section title="완료" items={data.done} empty="완료한 단계가 없습니다." isMe={data.isMe} onChanged={() => void load()} />
    </>
  );
}
