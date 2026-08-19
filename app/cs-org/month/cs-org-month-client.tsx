"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeadline } from "@/components/page-headline";
import { Button } from "@/components/ui/button";
import { parseYearMonth, shiftYearMonth } from "@/lib/cs-org-month";

type Brand = {
  clientId: string;
  name: string;
  roleLabel: string;
  from: string;
  until: string;
  days: number;
  ongoing: boolean;
};
type Person = { userId: string; name: string; position: string | null; brands: Brand[] };

function dayLabel(ymd: string) {
  return ymd.slice(8).replace(/^0/, "");
}

export function CsOrgMonthClient({ initialYm }: { initialYm: string }) {
  const [ym, setYm] = useState(parseYearMonth(initialYm));
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (nextYm: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cs-org/month?ym=${encodeURIComponent(nextYm)}`, { cache: "no-store" });
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
    void load(ym);
  }, [load, ym]);

  const [year, month] = ym.split("-");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeadline
          title="월별 담당"
          description="그달에 맡은 브랜드와, 며칠부터 며칠까지인지 확인합니다. 업체가 바뀌어도 이력이 남습니다."
        />
        <Button asChild variant="ghost">
          <Link href="/cs-org">조직도로</Link>
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon-sm" onClick={() => setYm((v) => shiftYearMonth(v, -1))}>
          <ChevronLeft className="size-4" />
        </Button>
        <p className="min-w-28 text-center text-base font-semibold">
          {year}년 {Number(month)}월
        </p>
        <Button type="button" variant="outline" size="icon-sm" onClick={() => setYm((v) => shiftYearMonth(v, 1))}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          불러오는 중…
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">담당자</th>
                <th className="px-3 py-2 font-medium">브랜드</th>
                <th className="px-3 py-2 font-medium">기간</th>
                <th className="px-3 py-2 font-medium">일수</th>
              </tr>
            </thead>
            <tbody>
              {people.every((p) => p.brands.length === 0) ? (
                <tr>
                  <td colSpan={4} className="text-muted-foreground px-3 py-8 text-center">
                    이달 담당 이력이 없습니다. 업체 담당자를 바꾸면 여기서 기간이 쌓입니다.
                  </td>
                </tr>
              ) : (
                people
                  .filter((p) => p.brands.length > 0)
                  .map((p) =>
                    p.brands.map((b, i) => (
                      <tr key={`${p.userId}-${b.clientId}-${b.from}`} className="border-t">
                        {i === 0 ? (
                          <td className="px-3 py-2 align-top font-medium" rowSpan={p.brands.length}>
                            {p.name}
                            {p.position ? (
                              <span className="text-muted-foreground block text-xs">{p.position}</span>
                            ) : null}
                          </td>
                        ) : null}
                        <td className="px-3 py-2">{b.name}</td>
                        <td className="px-3 py-2">
                          {Number(month)}/{dayLabel(b.from)} ~ {Number(month)}/{dayLabel(b.until)}
                          {b.ongoing ? " (현재)" : ""}
                        </td>
                        <td className="px-3 py-2">{b.days}일</td>
                      </tr>
                    ))
                  )
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
