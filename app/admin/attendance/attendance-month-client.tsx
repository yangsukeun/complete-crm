"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/api-swr";
import { PageHeadline } from "@/components/page-headline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toKstYmd } from "@/lib/date-kst";

type DayCell = {
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  incomplete: boolean;
  hasButton: boolean;
  source: "MACHINE_IMPORT" | "BUTTON" | null;
};

type EmployeeRow = {
  userId: string;
  name: string;
  department: string | null;
  machineNo: string | null;
  days: DayCell[];
};

type Api = {
  year: number;
  month: number;
  days: number[];
  employees: EmployeeRow[];
};

function currentKstYearMonth(): { year: number; month: number } {
  const ymd = toKstYmd(new Date());
  return { year: Number(ymd.slice(0, 4)), month: Number(ymd.slice(5, 7)) };
}

export function AttendanceMonthClient() {
  const initial = useMemo(() => currentKstYearMonth(), []);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);

  const key = `/api/attendance/records?year=${year}&month=${month}`;
  const { data, error, isLoading, mutate } = useSWR<Api>(key, jsonFetcher, {
    revalidateOnFocus: true,
  });

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth() + 1);
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeadline
          title="월별 근태 (기록기)"
          description="기록기 임포트 시각을 우선 표시합니다. 같은 날 버튼 출근이 있으면 뱃지만 달고, 버튼 기록은 삭제하지 않습니다."
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/attendance-import">엑셀 임포트</Link>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => shiftMonth(-1)}>
            이전 달
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => shiftMonth(1)}>
            다음 달
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void mutate()}>
            새로고침
          </Button>
        </div>
      </div>

      <p className="text-sm font-medium">
        {year}년 {month}월
        {data ? ` · ${data.employees.length}명` : ""}
      </p>

      {error && <p className="text-destructive text-sm">불러오지 못했습니다.</p>}
      {isLoading && !data && <p className="text-muted-foreground text-sm">불러오는 중…</p>}

      {data && (
        <div className="overflow-auto rounded-lg border">
          <table className="min-w-max border-collapse text-xs">
            <thead>
              <tr className="bg-muted/50">
                <th className="sticky left-0 z-20 bg-muted px-2 py-2 text-left">사원번호</th>
                <th className="sticky left-[4.5rem] z-20 bg-muted px-2 py-2 text-left">이름</th>
                {data.days.map((d) => (
                  <th key={d} className="min-w-[4.5rem] px-1 py-2 text-center">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.employees.map((emp) => (
                <tr key={emp.userId} className="border-t">
                  <td className="sticky left-0 z-10 bg-background px-2 py-1 font-mono">
                    {emp.machineNo ?? "—"}
                  </td>
                  <td className="sticky left-[4.5rem] z-10 bg-background px-2 py-1 whitespace-nowrap">
                    {emp.name}
                  </td>
                  {emp.days.map((cell) => (
                    <td
                      key={cell.date}
                      className={`px-1 py-1 text-center align-top ${
                        cell.incomplete ? "bg-amber-100 dark:bg-amber-950/50" : ""
                      }`}
                    >
                      {cell.clockIn || cell.clockOut ? (
                        <div className="leading-tight">
                          <div>{cell.clockIn ?? "—"}</div>
                          <div>{cell.clockOut ?? "—"}</div>
                          {cell.hasButton && cell.source === "MACHINE_IMPORT" && (
                            <Badge variant="outline" className="mt-0.5 px-1 py-0 text-[10px]">
                              버튼 기록 있음
                            </Badge>
                          )}
                          {cell.source === "BUTTON" && (
                            <Badge variant="secondary" className="mt-0.5 px-1 py-0 text-[10px]">
                              버튼
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">·</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
