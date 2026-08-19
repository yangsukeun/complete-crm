"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeadline } from "@/components/page-headline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Employee = {
  id: string;
  name: string;
  position: string | null;
  rankLabel: string;
};

type Exception = {
  employeeId: string;
  reason: string;
  createdAt: string;
  updatedAt: string;
};

type Api = {
  employees?: Employee[];
  exceptions?: Exception[];
  error?: string;
};

export function IdleWorkHourSettingsClient() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [exceptions, setExceptions] = useState<Map<string, Exception>>(() => new Map());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/attendance/idle/work-hour-exceptions", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as Api;
      if (!res.ok) throw new Error(data.error || "불러오지 못했습니다.");
      const rows = data.exceptions ?? [];
      setEmployees(data.employees ?? []);
      setExceptions(new Map(rows.map((r) => [r.employeeId, r])));
      setReasons(Object.fromEntries(rows.map((r) => [r.employeeId, r.reason])));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const checkedCount = useMemo(() => exceptions.size, [exceptions]);

  async function setAllDay(employeeId: string, on: boolean) {
    setBusyId(employeeId);
    const prev = exceptions.get(employeeId);
    const reason = (reasons[employeeId] ?? "").trim();
    try {
      if (on) {
        const res = await fetch("/api/attendance/idle/work-hour-exceptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeId, reason }),
        });
        const data = (await res.json().catch(() => ({}))) as Exception & { error?: string };
        if (!res.ok) throw new Error(data.error || "지정하지 못했습니다.");
        setExceptions((cur) => {
          const next = new Map(cur);
          next.set(employeeId, {
            employeeId: data.employeeId,
            reason: data.reason,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          });
          return next;
        });
      } else {
        const res = await fetch("/api/attendance/idle/work-hour-exceptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeId }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error || "해제하지 못했습니다.");
        setExceptions((cur) => {
          const next = new Map(cur);
          next.delete(employeeId);
          return next;
        });
      }
    } catch (e) {
      if (prev) {
        setExceptions((cur) => new Map(cur).set(employeeId, prev));
      }
      toast.error(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveReason(employeeId: string) {
    if (!exceptions.has(employeeId)) return;
    const reason = (reasons[employeeId] ?? "").trim();
    if (reason === (exceptions.get(employeeId)?.reason ?? "")) return;
    setBusyId(employeeId);
    try {
      const res = await fetch("/api/attendance/idle/work-hour-exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, reason }),
      });
      const data = (await res.json().catch(() => ({}))) as Exception & { error?: string };
      if (!res.ok) throw new Error(data.error || "사유를 저장하지 못했습니다.");
      setExceptions((cur) => {
        const next = new Map(cur);
        next.set(employeeId, {
          employeeId: data.employeeId,
          reason: data.reason,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
        return next;
      });
      setReasons((cur) => ({ ...cur, [employeeId]: data.reason }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "사유를 저장하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeadline
          title="자동 이석 근무시간"
          description="기본적으로 09:00~12:00, 13:00~18:00 안의 이석만 합산합니다. 24시간 근무로 지정한 직원은 점심·야간을 포함해 하루 전체를 합산합니다. 원본 감지 기록은 바뀌지 않습니다."
        />
        <Button asChild variant="outline" size="sm">
          <Link href="/cs-tools/idle">자동 이석으로</Link>
        </Button>
      </div>

      <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 shadow-sm">
        <p className="mb-1 text-sm font-semibold text-amber-950">24시간 근무 직원</p>
        <p className="text-muted-foreground mb-4 text-xs">
          체크하면 바로 저장됩니다. 지금은 {checkedCount}명입니다.
        </p>
        {loading ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            불러오는 중…
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="bg-amber-50/80 text-left text-xs font-semibold text-amber-950">
                <tr>
                  <th className="px-3 py-2">이름</th>
                  <th className="px-3 py-2">직책</th>
                  <th className="px-3 py-2">24시간 근무</th>
                  <th className="px-3 py-2">사유</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((p) => {
                  const on = exceptions.has(p.id);
                  const busy = busyId === p.id;
                  return (
                    <tr key={p.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{p.name}</td>
                      <td className="text-muted-foreground px-3 py-2">{p.position || p.rankLabel}</td>
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={busy}
                            onChange={(e) => void setAllDay(p.id, e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={reasons[p.id] ?? ""}
                          disabled={busy || !on}
                          placeholder="예: 커피에반하다 야간 담당"
                          className="h-8 bg-white text-sm"
                          onChange={(e) => setReasons((cur) => ({ ...cur, [p.id]: e.target.value }))}
                          onBlur={() => void saveReason(p.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
