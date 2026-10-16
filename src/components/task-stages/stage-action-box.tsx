"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CheckCircle2, History, Loader2, Save, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { stageFetch } from "./types";

type ProgressLog = {
  id: string;
  userName: string;
  note: string;
  progress: number;
  createdAt: string;
};

/**
 * 진행 중인 단계에서 담당자 본인이 쓰는 영역.
 * 저장 = 진행 메모 + 진행률 기록, 완료 = 내 담당분 끝(전원 완료 시 다음 단계로 넘어감)
 */
export function StageActionBox({
  stageId,
  myProgress,
  myCompletedAt,
  onChanged,
}: {
  stageId: string;
  myProgress: number;
  myCompletedAt: string | null;
  onChanged: () => void;
}) {
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState(myProgress);
  const [busy, setBusy] = useState<"save" | "complete" | "undo" | null>(null);
  const [logs, setLogs] = useState<ProgressLog[] | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);

  const loadLogs = async () => {
    try {
      const data = await stageFetch<{ logs: ProgressLog[] }>(`/api/task-stages/${stageId}/progress`);
      setLogs(data.logs);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "진행 기록을 불러오지 못했습니다.");
    }
  };

  const save = async () => {
    setBusy("save");
    try {
      await stageFetch(`/api/task-stages/${stageId}/progress`, {
        method: "POST",
        body: JSON.stringify({ note, progress }),
      });
      toast.success("진행 상황을 저장했습니다.");
      setNote("");
      if (logsOpen) await loadLogs();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const setCompleted = async (undo: boolean) => {
    if (!undo && !confirm("이 단계의 내 담당 업무를 완료할까요?\n단계 담당자가 모두 완료하면 다음 단계로 넘어가고 다음 담당자에게 알림이 갑니다.")) return;
    setBusy(undo ? "undo" : "complete");
    try {
      const r = await stageFetch<{ stageAdvanced: boolean; allDone: boolean }>(
        `/api/task-stages/${stageId}/complete`,
        { method: "POST", body: JSON.stringify({ undo }) }
      );
      toast.success(
        undo
          ? "완료를 취소했습니다."
          : r.allDone
            ? "모든 단계가 완료되었습니다."
            : r.stageAdvanced
              ? "단계가 완료되어 다음 단계로 넘어갔습니다."
              : "완료했습니다. 다른 담당자가 완료하면 다음 단계로 넘어갑니다."
      );
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "처리하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  if (myCompletedAt) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="size-4" />
          내 담당분 완료 ({format(new Date(myCompletedAt), "M월 d일 HH:mm", { locale: ko })}) · 다른 담당자 완료를 기다리는 중
        </span>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={busy !== null} onClick={() => void setCompleted(true)}>
          {busy === "undo" ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}
          완료 취소
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-sky-200 bg-sky-50/60 p-3">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="오늘 진행한 내용을 적어 주세요. (저장하면 날짜별로 기록됩니다)"
        rows={2}
        maxLength={2000}
        className="bg-white text-sm"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          진행률
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            className="w-32 accent-sky-600"
            aria-label="진행률"
          />
          <Input
            type="number"
            min={0}
            max={100}
            value={progress}
            onChange={(e) => setProgress(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            className="h-7 w-16 bg-white text-xs"
          />
          %
        </label>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1" disabled={busy !== null || !note.trim()} onClick={() => void save()}>
            {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            저장
          </Button>
          <Button type="button" size="sm" className="h-8 gap-1" disabled={busy !== null} onClick={() => void setCompleted(false)}>
            {busy === "complete" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            완료
          </Button>
        </div>
      </div>
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-sky-700 hover:underline"
        onClick={() => {
          const next = !logsOpen;
          setLogsOpen(next);
          if (next && !logs) void loadLogs();
        }}
      >
        <History className="size-3.5" />
        {logsOpen ? "진행 기록 닫기" : "진행 기록 보기"}
      </button>
      {logsOpen && <StageLogList logs={logs} />}
    </div>
  );
}

export function StageLogList({ logs }: { logs: ProgressLog[] | null }) {
  if (!logs) return <p className="text-xs text-muted-foreground">불러오는 중…</p>;
  if (logs.length === 0) return <p className="text-xs text-muted-foreground">아직 저장한 기록이 없습니다.</p>;
  return (
    <ul className="max-h-60 space-y-1.5 overflow-y-auto">
      {logs.map((l) => (
        <li key={l.id} className="rounded border border-gray-100 bg-white px-2.5 py-1.5 text-xs">
          <div className="flex gap-2 text-muted-foreground">
            <span>{format(new Date(l.createdAt), "M월 d일 HH:mm", { locale: ko })}</span>
            <span>{l.userName}</span>
            <span className="ml-auto tabular-nums">{l.progress}%</span>
          </div>
          <p className="mt-0.5 whitespace-pre-wrap text-gray-900">{l.note}</p>
        </li>
      ))}
    </ul>
  );
}

export type { ProgressLog };
