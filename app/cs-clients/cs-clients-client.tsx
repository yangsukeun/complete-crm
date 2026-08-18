"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeadline } from "@/components/page-headline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ColorChip } from "@/components/ui/color-chip";

type Assignment = { id: string; userId: string; name: string; roleLabel: string };
type ClientRow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  note: string;
  isActive: boolean;
  assignments: Assignment[];
};
type Staff = { id: string; name: string; position: string | null };

function InlineCell({
  value,
  disabled,
  onSave,
}: {
  value: string;
  disabled?: boolean;
  onSave: (next: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  if (disabled) {
    return <span className="text-sm">{value || "—"}</span>;
  }
  if (!editing) {
    return (
      <button
        type="button"
        className="flex h-9 w-full items-center truncate rounded-md border border-transparent px-2 text-left text-sm hover:border-border hover:bg-muted/60"
        onClick={() => setEditing(true)}
      >
        {value || <span className="text-muted-foreground">클릭해서 입력</span>}
      </button>
    );
  }
  return (
    <Input
      autoFocus
      value={draft}
      className="h-8"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) void onSave(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
    />
  );
}

export function CsClientsClient() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [assigneeId, setAssigneeId] = useState<string>("__ALL__");
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState({ name: "", startDate: "", endDate: "", note: "" });
  const [savingDraft, setSavingDraft] = useState(false);
  const draftNameRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cs-clients");
      const body = (await res.json().catch(() => ({}))) as {
        clients?: ClientRow[];
        staff?: Staff[];
        canManage?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || "목록을 불러오지 못했습니다.");
      setClients(body.clients ?? []);
      setStaff(body.staff ?? []);
      setCanManage(!!body.canManage);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (id: string, patchBody: Record<string, unknown>, prev: ClientRow[]) => {
    try {
      const res = await fetch(`/api/cs-clients/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });
      const body = (await res.json().catch(() => ({}))) as ClientRow & { error?: string };
      if (!res.ok) throw new Error(body.error || "저장에 실패했습니다.");
      setClients((cur) => cur.map((c) => (c.id === id ? { ...c, ...body } : c)));
    } catch (e) {
      setClients(prev);
      toast.error(e instanceof Error ? e.message : "저장에 실패했습니다.");
    }
  };

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return clients.filter((c) => {
      if (filter === "active" && !c.isActive) return false;
      if (assigneeId !== "__ALL__" && !c.assignments.some((a) => a.userId === assigneeId)) return false;
      if (!query) return true;
      const hay = `${c.name} ${c.note} ${c.startDate} ${c.endDate} ${c.assignments.map((a) => a.name).join(" ")}`.toLowerCase();
      return hay.includes(query);
    });
  }, [clients, filter, assigneeId, q]);

  const addRow = async () => {
    const name = draft.name.trim();
    if (!name) {
      draftNameRef.current?.focus();
      toast.error("업체명을 입력하세요.");
      return;
    }
    setSavingDraft(true);
    try {
      const res = await fetch("/api/cs-clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          startDate: draft.startDate.trim(),
          endDate: draft.endDate.trim(),
          note: draft.note.trim(),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as ClientRow & { error?: string };
      if (!res.ok) throw new Error(body.error || "추가에 실패했습니다.");
      setClients((cur) => [body, ...cur]);
      setDraft({ name: "", startDate: "", endDate: "", note: "" });
      toast.success("업체를 추가했습니다.");
      requestAnimationFrame(() => draftNameRef.current?.focus());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "추가에 실패했습니다.");
    } finally {
      setSavingDraft(false);
    }
  };

  const removeRow = async (row: ClientRow) => {
    if (!window.confirm(`「${row.name}」을 삭제할까요?`)) return;
    const prev = clients;
    setClients((cur) => cur.filter((c) => c.id !== row.id));
    try {
      const res = await fetch(`/api/cs-clients/${encodeURIComponent(row.id)}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "삭제에 실패했습니다.");
    } catch (e) {
      setClients(prev);
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    }
  };

  const saveAssignments = async (row: ClientRow, next: { userId: string; roleLabel: string }[]) => {
    const prev = clients;
    setClients((cur) =>
      cur.map((c) =>
        c.id === row.id
          ? {
              ...c,
              assignments: next.map((n) => ({
                id: n.userId,
                userId: n.userId,
                name: staff.find((s) => s.id === n.userId)?.name ?? "",
                roleLabel: n.roleLabel,
              })),
            }
          : c
      )
    );
    try {
      const res = await fetch(`/api/cs-clients/${encodeURIComponent(row.id)}/assignments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: next }),
      });
      const body = (await res.json().catch(() => ({}))) as ClientRow & { error?: string };
      if (!res.ok) throw new Error(body.error || "담당자 저장에 실패했습니다.");
      setClients((cur) => cur.map((c) => (c.id === row.id ? { ...c, ...body } : c)));
    } catch (e) {
      setClients(prev);
      toast.error(e instanceof Error ? e.message : "담당자 저장에 실패했습니다.");
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeadline
          title={canManage ? "업체 관리" : "내 담당 업체"}
          description={
            canManage
              ? "전체 업체 리스트에서 담당을 배정하고 계약 기간을 수정합니다."
              : "내가 맡은 업체만 표시됩니다."
          }
        />
        {canManage && (
          <Button type="button" size="sm" disabled={savingDraft} onClick={() => void addRow()}>
            {savingDraft ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            업체 추가 하기
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={filter} onValueChange={(v) => setFilter(v as "active" | "all")}>
          <SelectTrigger className="w-28" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">활성</SelectItem>
            <SelectItem value="all">전체</SelectItem>
          </SelectContent>
        </Select>
        <Select value={assigneeId} onValueChange={setAssigneeId}>
          <SelectTrigger className="w-36" size="sm">
            <SelectValue placeholder="담당자" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__ALL__">담당자 전체</SelectItem>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="검색"
          className="h-8 w-48"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          불러오는 중…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">업체명</th>
                <th className="px-3 py-2 font-medium">시작일</th>
                <th className="px-3 py-2 font-medium">종료일</th>
                <th className="px-3 py-2 font-medium">비고</th>
                <th className="px-3 py-2 font-medium">담당자</th>
                <th className="px-3 py-2 font-medium">활성</th>
                {canManage && <th className="w-24 px-2 py-2" />}
              </tr>
            </thead>
            <tbody>
              {canManage && (
                <tr className="border-t bg-primary/5">
                  <td className="px-2 py-2">
                    <Input
                      ref={draftNameRef}
                      value={draft.name}
                      onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                      placeholder="업체명"
                      className="h-9 bg-background"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void addRow();
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="date"
                      value={draft.startDate}
                      onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
                      className="h-9 bg-background"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="date"
                      value={draft.endDate}
                      onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
                      className="h-9 bg-background"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      value={draft.note}
                      onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                      placeholder="비고"
                      className="h-9 bg-background"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void addRow();
                      }}
                    />
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs">추가 후 배정</td>
                  <td className="text-muted-foreground px-3 py-2 text-xs">자동</td>
                  <td className="px-2 py-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={savingDraft}
                      onClick={() => void addRow()}
                    >
                      등록
                    </Button>
                  </td>
                </tr>
              )}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted-foreground px-3 py-8 text-center">
                  {canManage ? "아래 목록이 비어 있습니다. 위에서 업체를 추가하세요." : "맡은 업체가 없습니다."}
                  </td>
                </tr>
              ) : (
                visible.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-2 py-1.5">
                      <InlineCell
                        value={row.name}
                        disabled={!canManage}
                        onSave={async (name) => {
                          const prev = clients;
                          setClients((cur) => cur.map((c) => (c.id === row.id ? { ...c, name } : c)));
                          await patch(row.id, { name }, prev);
                        }}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <InlineCell
                        value={row.startDate}
                        disabled={!canManage}
                        onSave={async (startDate) => {
                          const prev = clients;
                          setClients((cur) => cur.map((c) => (c.id === row.id ? { ...c, startDate } : c)));
                          await patch(row.id, { startDate }, prev);
                        }}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <InlineCell
                        value={row.endDate}
                        disabled={!canManage}
                        onSave={async (endDate) => {
                          const prev = clients;
                          setClients((cur) =>
                            cur.map((c) =>
                              c.id === row.id ? { ...c, endDate, isActive: !endDate.trim() } : c
                            )
                          );
                          await patch(row.id, { endDate }, prev);
                        }}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <InlineCell
                        value={row.note}
                        disabled={!canManage}
                        onSave={async (note) => {
                          const prev = clients;
                          setClients((cur) => cur.map((c) => (c.id === row.id ? { ...c, note } : c)));
                          await patch(row.id, { note }, prev);
                        }}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <AssigneeCell
                        row={row}
                        staff={staff}
                        canManage={canManage}
                        onSave={(next) => void saveAssignments(row, next)}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <button
                        type="button"
                        disabled={!canManage}
                        className="disabled:opacity-60"
                        onClick={() => {
                          if (!canManage) return;
                          const prev = clients;
                          setClients((cur) =>
                            cur.map((c) => (c.id === row.id ? { ...c, isActive: !c.isActive } : c))
                          );
                          void patch(row.id, { isActive: !row.isActive }, prev);
                        }}
                      >
                        <ColorChip tone={row.isActive ? "green" : "gray"} size="sm">
                          {row.isActive ? "활성" : "비활성"}
                        </ColorChip>
                      </button>
                    </td>
                    {canManage && (
                      <td className="px-1 py-1.5">
                        <Button type="button" variant="ghost" size="icon-xs" onClick={() => void removeRow(row)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AssigneeCell({
  row,
  staff,
  canManage,
  onSave,
}: {
  row: ClientRow;
  staff: Staff[];
  canManage: boolean;
  onSave: (next: { userId: string; roleLabel: string }[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ userId: string; roleLabel: string }[]>([]);

  useEffect(() => {
    if (open) {
      setDraft(row.assignments.map((a) => ({ userId: a.userId, roleLabel: a.roleLabel })));
    }
  }, [open, row.assignments]);

  const chips = (
    <div className="flex flex-wrap gap-1">
      {row.assignments.length === 0 ? (
        <span className="text-muted-foreground text-xs">—</span>
      ) : (
        row.assignments.map((a) => (
          <ColorChip key={a.userId} tone="blue" size="sm">
            {a.name}
            {a.roleLabel ? ` · ${a.roleLabel}` : ""}
          </ColorChip>
        ))
      )}
    </div>
  );

  if (!canManage) return chips;

  const selected = new Set(draft.map((d) => d.userId));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="w-full rounded px-1 py-0.5 text-left hover:bg-muted/60">
          {chips}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {staff.map((s) => {
            const on = selected.has(s.id);
            const role = draft.find((d) => d.userId === s.id)?.roleLabel ?? "";
            return (
              <div key={s.id} className="flex items-center gap-2">
                <Checkbox
                  checked={on}
                  onCheckedChange={(v) => {
                    if (v) setDraft((d) => [...d, { userId: s.id, roleLabel: "담당" }]);
                    else setDraft((d) => d.filter((x) => x.userId !== s.id));
                  }}
                />
                <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                {on && (
                  <Input
                    value={role}
                    className="h-7 w-24"
                    onChange={(e) =>
                      setDraft((d) =>
                        d.map((x) => (x.userId === s.id ? { ...x, roleLabel: e.target.value } : x))
                      )
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              onSave(draft);
              setOpen(false);
            }}
          >
            저장
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
