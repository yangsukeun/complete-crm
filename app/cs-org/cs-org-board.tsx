"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, StickyNote, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ColorChip } from "@/components/ui/color-chip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type OrgHire = { id: string; name: string; joinDate: string; note: string };
export type OrgPhaseClient = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  note: string;
  phase: "INCOMING" | "OUTGOING";
  assignees: string[];
};
export type OrgClientOption = { id: string; name: string; phase: string };

export function CsOrgBoard({
  initialMemo,
  initialHires,
  incoming: initialIncoming,
  outgoing: initialOutgoing,
  catalog,
}: {
  initialMemo: string;
  initialHires: OrgHire[];
  incoming: OrgPhaseClient[];
  outgoing: OrgPhaseClient[];
  catalog: OrgClientOption[];
}) {
  const router = useRouter();
  const [memo, setMemo] = useState(initialMemo);
  const [savingMemo, setSavingMemo] = useState(false);
  const [hires, setHires] = useState(initialHires);
  const [incoming, setIncoming] = useState(initialIncoming);
  const [outgoing, setOutgoing] = useState(initialOutgoing);
  const [draft, setDraft] = useState({ name: "", joinDate: "", note: "" });
  const [adding, setAdding] = useState(false);

  async function saveMemo() {
    setSavingMemo(true);
    try {
      const res = await fetch("/api/cs-org/memo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: memo }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "저장하지 못했습니다.");
      toast.success("메모를 저장했습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSavingMemo(false);
    }
  }

  async function addHire() {
    const name = draft.name.trim();
    if (!name) {
      toast.error("이름을 입력하세요.");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/cs-org/hires", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = (await res.json().catch(() => ({}))) as OrgHire & { error?: string };
      if (!res.ok) throw new Error(data.error || "추가하지 못했습니다.");
      setHires((cur) => [...cur, { id: data.id, name: data.name, joinDate: data.joinDate, note: data.note }]);
      setDraft({ name: "", joinDate: "", note: "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "추가하지 못했습니다.");
    } finally {
      setAdding(false);
    }
  }

  async function removeHire(id: string) {
    const prev = hires;
    setHires((cur) => cur.filter((h) => h.id !== id));
    try {
      const res = await fetch(`/api/cs-org/hires/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("삭제하지 못했습니다.");
    } catch (e) {
      setHires(prev);
      toast.error(e instanceof Error ? e.message : "삭제하지 못했습니다.");
    }
  }

  function applyClient(row: OrgPhaseClient) {
    setIncoming((cur) =>
      row.phase === "INCOMING" ? [row, ...cur.filter((c) => c.id !== row.id)] : cur.filter((c) => c.id !== row.id)
    );
    setOutgoing((cur) =>
      row.phase === "OUTGOING" ? [row, ...cur.filter((c) => c.id !== row.id)] : cur.filter((c) => c.id !== row.id)
    );
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="rounded-xl border border-sky-200 bg-sky-50/70 p-4">
        <h2 className="cs-section-title mb-3 flex items-center gap-2">
          <UserPlus className="size-4" />
          입사할 직원
        </h2>
        <ul className="space-y-2">
          {hires.length === 0 ? (
            <li className="text-muted-foreground text-sm">예정 인원이 없습니다.</li>
          ) : (
            hires.map((h) => (
              <li key={h.id} className="flex items-start justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{h.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {h.joinDate ? `${h.joinDate} 입사` : "날짜 미정"}
                    {h.note ? ` · ${h.note}` : ""}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="icon-xs" onClick={() => void removeHire(h.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))
          )}
        </ul>
        <div className="mt-3 grid gap-2">
          <Input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="이름 (예: 신입2)"
            className="h-9 bg-white"
          />
          <Input
            type="date"
            value={draft.joinDate}
            onChange={(e) => setDraft((d) => ({ ...d, joinDate: e.target.value }))}
            className="h-9 bg-white"
          />
          <Input
            value={draft.note}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            placeholder="메모"
            className="h-9 bg-white"
          />
          <Button type="button" size="sm" disabled={adding} onClick={() => void addHire()}>
            {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            추가
          </Button>
        </div>
      </section>

      <PhaseList
        title="들어올 업체"
        tone="yellow"
        phase="INCOMING"
        rows={incoming}
        catalog={catalog}
        empty="예정 업체가 없습니다. 아래에서 바로 등록하세요."
        onApplied={applyClient}
      />
      <PhaseList
        title="나갈 업체"
        tone="pink"
        phase="OUTGOING"
        rows={outgoing}
        catalog={catalog}
        empty="종료 예정 업체가 없습니다. 아래에서 바로 등록하세요."
        onApplied={applyClient}
      />

      <section className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 lg:col-span-3">
        <h2 className="cs-section-title mb-3 flex items-center gap-2">
          <StickyNote className="size-4" />
          메모
        </h2>
        <Textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="운영 메모를 적어 두세요. (투입 일정, 서브 배치 등)"
          className="min-h-32 bg-white"
        />
        <div className="mt-3 flex justify-end">
          <Button type="button" size="sm" disabled={savingMemo} onClick={() => void saveMemo()}>
            {savingMemo ? <Loader2 className="size-4 animate-spin" /> : null}
            메모 저장
          </Button>
        </div>
      </section>
    </div>
  );
}

function toPhaseRow(body: {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  note?: string;
  phase?: string;
  assignments?: { name: string }[];
}, phase: "INCOMING" | "OUTGOING"): OrgPhaseClient {
  return {
    id: body.id,
    name: body.name,
    startDate: body.startDate ?? "",
    endDate: body.endDate ?? "",
    note: body.note ?? "",
    phase,
    assignees: (body.assignments ?? []).map((a) => a.name),
  };
}

function PhaseList({
  title,
  tone,
  phase,
  rows,
  catalog,
  empty,
  onApplied,
}: {
  title: string;
  tone: "yellow" | "pink";
  phase: "INCOMING" | "OUTGOING";
  rows: OrgPhaseClient[];
  catalog: OrgClientOption[];
  empty: string;
  onApplied: (row: OrgPhaseClient) => void;
}) {
  const [draft, setDraft] = useState({ name: "", startDate: "", endDate: "", note: "" });
  const [existingId, setExistingId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const unused = useMemo(
    () => catalog.filter((c) => c.phase !== phase && !rows.some((r) => r.id === c.id)),
    [catalog, phase, rows]
  );

  async function addNew() {
    const name = draft.name.trim();
    if (!name) {
      toast.error("업체명을 입력하세요.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/cs-clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, phase }),
      });
      const data = (await res.json().catch(() => ({}))) as ReturnType<typeof toPhaseRow> & { error?: string };
      if (!res.ok) throw new Error(data.error || "등록하지 못했습니다.");
      onApplied(toPhaseRow(data, phase));
      setDraft({ name: "", startDate: "", endDate: "", note: "" });
      toast.success(`${title}로 등록했습니다.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "등록하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function markExisting() {
    if (!existingId) {
      toast.error("기존 업체를 고르세요.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/cs-clients/${encodeURIComponent(existingId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase }),
      });
      const data = (await res.json().catch(() => ({}))) as ReturnType<typeof toPhaseRow> & { error?: string };
      if (!res.ok) throw new Error(data.error || "지정하지 못했습니다.");
      onApplied(toPhaseRow(data, phase));
      setExistingId("");
      toast.success(`${title}로 지정했습니다.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "지정하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="cs-section-title mb-3">
        <ColorChip tone={tone} size="sm">
          {title}
        </ColorChip>
      </h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id} className="rounded-lg border px-3 py-2 text-sm">
              <p className="font-medium">{c.name}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {c.startDate || c.endDate ? `${c.startDate || "—"} ~ ${c.endDate || "—"}` : "기간 미정"}
                {c.assignees.length > 0 ? ` · ${c.assignees.join(", ")}` : ""}
              </p>
              {c.note ? <p className="mt-1 text-xs">{c.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 grid gap-2 border-t pt-3">
        <p className="text-xs font-semibold">새 업체 등록</p>
        <Input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder="업체명"
          className="h-9"
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="date"
            value={draft.startDate}
            onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
            className="h-9"
          />
          <Input
            type="date"
            value={draft.endDate}
            onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
            className="h-9"
          />
        </div>
        <Input
          value={draft.note}
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
          placeholder="메모"
          className="h-9"
        />
        <Button type="button" size="sm" disabled={saving} onClick={() => void addNew()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {title}로 등록
        </Button>
        {unused.length > 0 ? (
          <>
            <p className="mt-1 text-xs font-semibold">기존 업체 지정</p>
            <Select value={existingId} onValueChange={setExistingId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="업체 고르기" />
              </SelectTrigger>
              <SelectContent>
                {unused.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void markExisting()}>
              {title}로 지정
            </Button>
          </>
        ) : null}
      </div>
    </section>
  );
}
