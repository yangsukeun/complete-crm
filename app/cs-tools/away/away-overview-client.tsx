"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/api-swr";
import { PageHeadline } from "@/components/page-headline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ColorChip, NameWithBirthday } from "@/components/ui/color-chip";

type Totals = {
  count: number;
  durationMs: number;
};

type Api = {
  now: string;
  current: {
    id: string;
    userId: string;
    name: string;
    department: string | null;
    startedAt: string;
    elapsedMs: number;
    birthdayToday: boolean;
  }[];
  totals: {
    userId: string;
    name: string;
    department: string | null;
    birthdayToday: boolean;
    today: Totals;
    week: Totals;
    month: Totals;
  }[];
};

function fmtDur(ms: number): string {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0) return `${h}시간 ${min}분`;
  return `${min}분`;
}

function TotalsCell({ t }: { t: Totals }) {
  if (t.count === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span>
      {t.count}회 · {fmtDur(t.durationMs)}
    </span>
  );
}

export function AwayOverviewClient() {
  const { data, error, isLoading, mutate } = useSWR<Api>("/api/attendance/away/overview", jsonFetcher, {
    refreshInterval: 20_000,
    revalidateOnFocus: true,
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeadline
          title="CS 이석 현황"
          description="현재 부재중 인원과 오늘·이번 주·이번 달 누적입니다. 20초마다 새로고침합니다."
        />
        <Button type="button" variant="outline" size="sm" onClick={() => void mutate()}>
          새로고침
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">불러오지 못했습니다.</p>}
      {isLoading && !data && <p className="text-muted-foreground text-sm">불러오는 중…</p>}

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="cs-section-title">현재 부재중</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex items-end gap-3">
                <p className="cs-stat tabular-nums">{data.current.length}</p>
                <ColorChip tone="yellow">명</ColorChip>
              </div>
              {data.current.length === 0 ? (
                <p className="text-muted-foreground text-sm">부재중인 사람이 없습니다.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {data.current.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">
                        <NameWithBirthday name={row.name} birthdayToday={row.birthdayToday} />
                      </span>
                      <ColorChip tone="yellow" size="sm">
                        {fmtDur(row.elapsedMs)} 경과
                      </ColorChip>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left">이름</th>
                  <th className="px-4 py-3 text-left">부서</th>
                  <th className="px-4 py-3 text-left">오늘</th>
                  <th className="px-4 py-3 text-left">이번 주</th>
                  <th className="px-4 py-3 text-left">이번 달</th>
                </tr>
              </thead>
              <tbody>
                {data.totals.map((row) => (
                  <tr key={row.userId} className="border-t">
                    <td className="px-4 py-3 font-semibold">
                      <NameWithBirthday name={row.name} birthdayToday={row.birthdayToday} />
                    </td>
                    <td className="px-4 py-3">{row.department ?? "—"}</td>
                    <td className="px-4 py-3">
                      <TotalsCell t={row.today} />
                    </td>
                    <td className="px-4 py-3">
                      <TotalsCell t={row.week} />
                    </td>
                    <td className="px-4 py-3">
                      <TotalsCell t={row.month} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
