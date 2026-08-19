"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, StickyNote, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CS_ORG_MEMO_LABELS, parseCsOrgMemoSlots, stringifyCsOrgMemoSlots, type CsOrgMemoSlots } from "@/lib/cs-org-memo";

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
  const [slots, setSlots] = useState<CsOrgMemoSlots>(() => parseCsOrgMemoSlots(initialMemo));
  const [savingMemo, setSavingMemo] = useState(false);
  const [hires, setHires] = useState(initialHires);
  const [incoming, setIncoming] = useState(initialIncoming);
  const [outgoing, setOutgoing] = useState(initialOutgoing);
  const [hireName, setHireName] = useState("");
  const [adding, setAdding] = useState(false);

  async function saveMemo() {
    setSavingMemo(true);
    try {
      const res = await fetch("/api/cs-org/memo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: stringifyCsOrgMemoSlots(slots) }),
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
    const name = hireName.trim();
    if (!name) {
      toast.error("이름을 입력하세요.");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/cs-org/hires", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json().catch(() => ({}))) as OrgHire & { error?: string };
      if (!res.ok) throw new Error(data.error || "추가하지 못했습니다.");
      setHires((cur) => [...cur, { id: data.id, name: data.name, joinDate: data.joinDate, note: data.note }]);
      setHireName("");
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
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-3">
        <section className="rounded-lg border border-sky-200 bg-sky-50/70 p-2">
          <h2 className="mb-1.5 text-[11px] font-semibold text-sky-950">입사할 직원</h2>
          <ul className="max-h-24 space-y-0.5 overflow-y-auto text-xs">
            {hires.length === 0 ? (
              <li className="text-muted-foreground">없음</li>
            ) : (
              hires.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-1 rounded bg-white px-1.5 py-0.5">
                  <span className="min-w-0 truncate">
                    {h.name}
                    {h.joinDate ? <span className="text-muted-foreground"> · {h.joinDate.slice(5)}</span> : null}
                  </span>
                  <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => void removeHire(h.id)}>
                    <Trash2 className="size-3" />
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="mt-1.5 flex gap-1">
            <Input
              value={hireName}
              onChange={(e) => setHireName(e.target.value)}
              placeholder="이름"
              className="h-7 bg-white text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") void addHire();
              }}
            />
            <Button type="button" size="xs" disabled={adding} onClick={() => void addHire()}>
              {adding ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
            </Button>
          </div>
        </section>

        <PhaseList
          title="들어올 업체"
          tone="yellow"
          phase="INCOMING"
          rows={incoming}
          catalog={catalog}
          onApplied={applyClient}
        />
        <PhaseList
          title="나갈 업체"
          tone="pink"
          phase="OUTGOING"
          rows={outgoing}
          catalog={catalog}
          onApplied={applyClient}
        />
      </div>

      <section className="rounded-lg border border-amber-200 bg-amber-50/70 p-2">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1 text-[11px] font-semibold text-amber-950">
            <StickyNote className="size-3.5" />
            메모
          </h2>
          <Button type="button" size="xs" disabled={savingMemo} onClick={() => void saveMemo()}>
            {savingMemo ? <Loader2 className="size-3 animate-spin" /> : null}
            저장
          </Button>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {(["a", "b", "c"] as const).map((key, i) => (
            <Textarea
              key={key}
              value={slots[key]}
              onChange={(e) => setSlots((s) => ({ ...s, [key]: e.target.value }))}
              placeholder={CS_ORG_MEMO_LABELS[i]}
              className="min-h-[4.5rem] bg-white text-xs"
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function toPhaseRow(
  body: {
    id: string;
    name: string;
    startDate?: string;
    endDate?: string;
    note?: string;
    phase?: string;
    assignments?: { name: string }[];
  },
  phase: "INCOMING" | "OUTGOING"
): OrgPhaseClient {
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
  onApplied,
}: {
  title: string;
  tone: "yellow" | "pink";
  phase: "INCOMING" | "OUTGOING";
  rows: OrgPhaseClient[];
  catalog: OrgClientOption[];
  onApplied: (row: OrgPhaseClient) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [existingId, setExistingId] = useState("");
  const [saving, setSaving] = useState(false);
  const unused = useMemo(
    () => catalog.filter((c) => c.phase !== phase && !rows.some((r) => r.id === c.id)),
    [catalog, phase, rows]
  );

  async function addNew() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("업체명을 입력하세요.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/cs-clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, phase }),
      });
      const data = (await res.json().catch(() => ({}))) as ReturnType<typeof toPhaseRow> & { error?: string };
      if (!res.ok) throw new Error(data.error || "등록하지 못했습니다.");
      onApplied(toPhaseRow(data, phase));
      setName("");
      setOpen(false);
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
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "지정하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const border = tone === "yellow" ? "border-yellow-200 bg-yellow-50/70" : "border-pink-200 bg-pink-50/70";

  return (
    <section className={`rounded-lg border p-2 ${border}`}>
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <h2 className="text-[11px] font-semibold">{title}</h2>
        <Button type="button" size="xs" variant="ghost" onClick={() => setOpen((v) => !v)}>
          <Plus className="size-3" />
        </Button>
      </div>
      <ul className="max-h-24 space-y-0.5 overflow-y-auto text-xs">
        {rows.length === 0 ? (
          <li className="text-muted-foreground">없음</li>
        ) : (
          rows.map((c) => (
            <li key={c.id} className="truncate rounded bg-white px-1.5 py-0.5">
              {c.name}
              {c.assignees.length > 0 ? (
                <span className="text-muted-foreground"> · {c.assignees.join(", ")}</span>
              ) : null}
            </li>
          ))
        )}
      </ul>
      {open ? (
        <div className="mt-1.5 grid gap-1">
          <div className="flex gap-1">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="새 업체명"
              className="h-7 bg-white text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") void addNew();
              }}
            />
            <Button type="button" size="xs" disabled={saving} onClick={() => void addNew()}>
              등록
            </Button>
          </div>
          {unused.length > 0 ? (
            <div className="flex gap-1">
              <Select value={existingId} onValueChange={setExistingId}>
                <SelectTrigger className="h-7 min-w-0 flex-1 text-xs">
                  <SelectValue placeholder="기존 업체" />
                </SelectTrigger>
                <SelectContent>
                  {unused.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" size="xs" variant="outline" disabled={saving} onClick={() => void markExisting()}>
                지정
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
