"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BookmarkPlus, Loader2, Lock, Plus, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { stageFetch, type StageCandidate, type StageView, type TaskStagesResponse } from "./types";

type Row = { key: string; id: string | null; name: string; assigneeIds: string[]; locked: boolean };
type Template = { id: string; name: string; stageNames: string[] };

let keySeq = 0;
const newKey = () => `row-${++keySeq}`;

function rowsFromStages(stages: StageView[]): Row[] {
  return stages.map((s) => ({
    key: newKey(),
    id: s.id,
    name: s.name,
    assigneeIds: s.assignees.map((a) => a.userId),
    locked: s.status === "DONE",
  }));
}

function candidateLabel(c: StageCandidate) {
  return c.position ? `${c.name} ${c.position}` : c.name;
}

/** 담당자 여러 명 선택 */
function AssigneePicker({
  candidates,
  value,
  onChange,
  disabled,
}: {
  candidates: StageCandidate[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const filtered = candidates.filter((c) =>
    `${c.name} ${c.position ?? ""} ${c.department ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())
  );
  return (
    <div className="flex flex-wrap items-center gap-1">
      {value.map((id) => (
        <span key={id} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs">
          {byId.get(id) ? candidateLabel(byId.get(id)!) : "알 수 없음"}
          {!disabled && (
            <button type="button" aria-label="담당자 빼기" onClick={() => onChange(value.filter((v) => v !== id))}>
              <X className="size-3 text-muted-foreground" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-xs text-sky-700">
              <UserPlus className="size-3.5" />
              담당자
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·부서 검색" className="mb-2 h-8 text-xs" />
            <ul className="max-h-60 overflow-y-auto">
              {filtered.map((c) => {
                const checked = value.includes(c.id);
                return (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onChange(checked ? value.filter((v) => v !== c.id) : [...value, c.id])}
                      />
                      <span className="font-medium">{candidateLabel(c)}</span>
                      {c.department && <span className="text-muted-foreground">{c.department}</span>}
                    </label>
                  </li>
                );
              })}
              {filtered.length === 0 && <li className="px-1.5 py-2 text-xs text-muted-foreground">검색 결과가 없습니다.</li>}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

export function StageEditor({
  taskId,
  data,
  onSaved,
  onCancel,
}: {
  taskId: string;
  data: TaskStagesResponse;
  onSaved: (next: TaskStagesResponse) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => rowsFromStages(data.stages));
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [range, setRange] = useState({ userId: "", from: 1, to: 1 });
  const candidates = data.candidates;

  useEffect(() => {
    stageFetch<{ templates: Template[] }>("/api/task-stage-templates")
      .then((d) => setTemplates(d.templates))
      .catch(() => setTemplates([]));
  }, []);

  const lockedCount = rows.filter((r) => r.locked).length;
  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index: number, dir: -1 | 1) =>
    setRows((rs) => {
      const j = index + dir;
      if (j < lockedCount || j >= rs.length || rs[index].locked) return rs;
      const next = [...rs];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });

  const applyTemplate = (t: Template) => {
    const fresh = t.stageNames.map((name) => ({ key: newKey(), id: null, name, assigneeIds: [], locked: false }));
    const unlockedHasContent = rows.some((r) => !r.locked);
    if (unlockedHasContent && !confirm(`「${t.name}」 템플릿으로 바꿀까요?\n완료되지 않은 단계는 템플릿 단계로 교체됩니다.`)) return;
    setRows((rs) => [...rs.filter((r) => r.locked), ...fresh]);
  };

  const saveTemplate = async () => {
    const names = rows.map((r) => r.name.trim()).filter(Boolean);
    if (names.length === 0) return toast.error("템플릿으로 저장할 단계가 없습니다.");
    const name = prompt("템플릿 이름을 입력하세요 (같은 이름이면 덮어씁니다)", "")?.trim();
    if (!name) return;
    try {
      const d = await stageFetch<{ templates: Template[] }>("/api/task-stage-templates", {
        method: "POST",
        body: JSON.stringify({ name, stageNames: names }),
      });
      setTemplates(d.templates);
      toast.success(`「${name}」 템플릿을 저장했습니다.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "템플릿을 저장하지 못했습니다.");
    }
  };

  const deleteTemplate = async (t: Template) => {
    if (!confirm(`「${t.name}」 템플릿을 삭제할까요?`)) return;
    try {
      const d = await stageFetch<{ templates: Template[] }>(`/api/task-stage-templates?id=${encodeURIComponent(t.id)}`, { method: "DELETE" });
      setTemplates(d.templates);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "템플릿을 삭제하지 못했습니다.");
    }
  };

  /** 예: 김대리를 2~4단계에 넣기 */
  const applyRange = () => {
    const { userId, from, to } = range;
    if (!userId) return toast.error("직원을 선택해 주세요.");
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    setRows((rs) =>
      rs.map((r, i) =>
        i + 1 >= lo && i + 1 <= hi && !r.locked && !r.assigneeIds.includes(userId)
          ? { ...r, assigneeIds: [...r.assigneeIds, userId] }
          : r
      )
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      const next = await stageFetch<TaskStagesResponse>(`/api/tasks/${taskId}/stages`, {
        method: "PUT",
        body: JSON.stringify({
          stages: rows.map((r) => ({ id: r.id, name: r.name, assigneeIds: r.assigneeIds })),
        }),
      });
      toast.success(data.stages.length === 0 ? "단계를 만들고 1단계를 시작했습니다. 담당자에게 알림이 갔습니다." : "단계를 저장했습니다.");
      onSaved({ ...next, candidates: data.candidates });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "단계를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-gray-300 p-2 text-xs">
        <span className="text-muted-foreground">템플릿</span>
        {templates.length === 0 && <span className="text-muted-foreground">저장된 템플릿이 없습니다.</span>}
        {templates.map((t) => (
          <span key={t.id} className="inline-flex items-center overflow-hidden rounded-full border border-gray-200 bg-white">
            <button type="button" className="px-2 py-0.5 hover:bg-gray-50" title={t.stageNames.join(" → ")} onClick={() => applyTemplate(t)}>
              {t.name} ({t.stageNames.length})
            </button>
            <button type="button" className="border-l border-gray-200 px-1 py-0.5 hover:bg-rose-50" aria-label={`${t.name} 템플릿 삭제`} onClick={() => void deleteTemplate(t)}>
              <X className="size-3 text-muted-foreground" />
            </button>
          </span>
        ))}
        <Button type="button" variant="ghost" size="sm" className="ml-auto h-6 gap-1 px-1.5 text-xs" onClick={() => void saveTemplate()}>
          <BookmarkPlus className="size-3.5" />
          지금 단계를 템플릿으로 저장
        </Button>
      </div>

      <ol className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.key} className={cn("rounded-md border p-2", r.locked ? "border-emerald-200 bg-emerald-50/50" : "border-gray-200 bg-white")}>
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs font-semibold text-muted-foreground">{i + 1}단계</span>
              <Input value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} placeholder="단계 이름 (예: 기획)" maxLength={60} className="h-8 text-sm" />
              {r.locked ? (
                <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-700" title="완료된 단계는 이름만 바꿀 수 있습니다">
                  <Lock className="size-3.5" />
                  완료
                </span>
              ) : (
                <div className="flex shrink-0 gap-0.5">
                  <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="위로" disabled={i <= lockedCount} onClick={() => move(i, -1)}>
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="아래로" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-rose-600" aria-label="단계 삭제" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
            <div className="mt-1.5 pl-14">
              <AssigneePicker
                candidates={candidates}
                value={r.assigneeIds}
                onChange={(ids) => update(r.key, { assigneeIds: ids })}
                disabled={r.locked}
              />
            </div>
          </li>
        ))}
      </ol>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1"
        disabled={rows.length >= 30}
        onClick={() => setRows((rs) => [...rs, { key: newKey(), id: null, name: "", assigneeIds: [], locked: false }])}
      >
        <Plus className="size-4" />
        단계 추가
      </Button>

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-gray-50 p-2 text-xs">
          <span className="font-medium">담당자 범위 지정</span>
          <select
            className="h-7 rounded border border-gray-200 bg-white px-1"
            value={range.userId}
            onChange={(e) => setRange((s) => ({ ...s, userId: e.target.value }))}
            aria-label="직원"
          >
            <option value="">직원 선택</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {candidateLabel(c)}
              </option>
            ))}
          </select>
          <select className="h-7 rounded border border-gray-200 bg-white px-1" value={range.from} onChange={(e) => setRange((s) => ({ ...s, from: Number(e.target.value) }))} aria-label="시작 단계">
            {rows.map((_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}단계
              </option>
            ))}
          </select>
          부터
          <select className="h-7 rounded border border-gray-200 bg-white px-1" value={range.to} onChange={(e) => setRange((s) => ({ ...s, to: Number(e.target.value) }))} aria-label="끝 단계">
            {rows.map((_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}단계
              </option>
            ))}
          </select>
          까지
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={applyRange}>
            넣기
          </Button>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          취소
        </Button>
        <Button type="button" size="sm" className="gap-1" onClick={() => void save()} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          단계 저장
        </Button>
      </div>
    </div>
  );
}
