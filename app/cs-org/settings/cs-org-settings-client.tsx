"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { PageHeadline } from "@/components/page-headline";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { allowedCsOrgManagers, csOrgRankLabel, type CsOrgRank } from "@/lib/cs-org";

type Person = {
  id: string;
  name: string;
  position: string | null;
  rank: CsOrgRank;
  reportsToId: string | null;
  clients: string[];
};

const NONE = "__none__";

export function CsOrgSettingsClient() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cs-org/reports", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { people?: Person[]; error?: string };
      if (!res.ok) throw new Error(data.error || "불러오지 못했습니다.");
      setPeople(data.people ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function setReportsTo(userId: string, reportsToId: string | null) {
    setPeople((prev) => prev.map((p) => (p.id === userId ? { ...p, reportsToId } : p)));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/cs-org/reports", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reports: people.map((p) => ({ userId: p.id, reportsToId: p.reportsToId })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { people?: Person[]; error?: string };
      if (!res.ok) throw new Error(data.error || "저장하지 못했습니다.");
      setPeople(data.people ?? people);
      toast.success("소속을 저장했습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeadline
          title="설정 창고"
          description="사원이 어느 팀장·부팀장 밑에 있는지 지정합니다. 센터장은 맨 위에 고정됩니다."
        />
        <Button asChild variant="ghost">
          <Link href="/cs-org">조직도로</Link>
        </Button>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 shadow-sm">
        <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-amber-950">
          <Warehouse className="size-4" />
          소속 지정
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
                  <th className="px-3 py-2">소속 상사</th>
                  <th className="px-3 py-2">담당 업체</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const managers = allowedCsOrgManagers(p, people);
                  const locked = p.rank === "chief";
                  return (
                    <tr key={p.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{p.name}</td>
                      <td className="text-muted-foreground px-3 py-2">
                        {p.position || csOrgRankLabel(p.rank)}
                      </td>
                      <td className="px-3 py-2">
                        {locked ? (
                          <span className="text-muted-foreground">최상위 (센터장)</span>
                        ) : (
                          <Select
                            value={p.reportsToId ?? NONE}
                            onValueChange={(v) => setReportsTo(p.id, v === NONE ? null : v)}
                          >
                            <SelectTrigger className="h-9 min-w-44">
                              <SelectValue placeholder="미소속" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>미소속</SelectItem>
                              {managers.map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                  {m.name}
                                  {m.position ? ` · ${m.position}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {p.clients.length > 0 ? p.clients.join(", ") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button type="button" onClick={() => void save()} disabled={loading || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            저장
          </Button>
        </div>
      </div>
    </div>
  );
}
