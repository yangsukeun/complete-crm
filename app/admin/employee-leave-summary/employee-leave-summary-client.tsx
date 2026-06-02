"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/api-swr";
import { PageHeadline } from "@/components/page-headline";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

type Row = {
  userId: string;
  name: string;
  department: string | null;
  position: string | null;
  joinDate: string;
  tenureYears: number;
  tenureExtraMonths: number;
  remaining: number;
  compensationOwedDays: number;
  shortage?: boolean;
};

type Api = { year: number; rows: Row[] };

function fmt1(n: number): string {
  return n.toFixed(n % 1 === 0 ? 0 : 1);
}

function tenureText(years: number, extraMonths: number): string {
  return `${years}년${extraMonths > 0 ? ` ${extraMonths}개월` : ""}`;
}

export function EmployeeLeaveSummaryClient() {
  const { data, error, isLoading, mutate } = useSWR<Api>("/api/admin/employee-leave-summary", jsonFetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
  });

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeadline
          title="직원 연차·월차 현황"
          description="잔여·수당대상만 빠르게 확인하고, 풀·신청·산수 검증은 상세보기에서 확인하세요."
        />
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void mutate()}>
            새로고침
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/employees">직원 관리</Link>
          </Button>
        </div>
      </div>

      {error && <p className="text-destructive text-sm">불러오지 못했습니다.</p>}
      {isLoading && !data && <p className="text-muted-foreground text-sm">불러오는 중…</p>}

      {data && (
        <>
          <p className="text-muted-foreground text-sm">
            기준 연도: <strong>{data.year}</strong>년 · 직원 {data.rows.length}명
          </p>
          <div className="w-full overflow-hidden rounded-lg border shadow-sm">
            <Table className="w-full table-fixed text-sm">
              <colgroup>
                <col style={{ width: "14%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "14%" }} />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>부서 / 직책</TableHead>
                  <TableHead>입사일</TableHead>
                  <TableHead>근속</TableHead>
                  <TableHead className="text-right">잔여</TableHead>
                  <TableHead className="text-right">수당대상</TableHead>
                  <TableHead className="text-center">상세</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.userId} className={r.shortage ? "bg-destructive/5 hover:bg-destructive/10" : "hover:bg-muted/50"}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{r.name}</span>
                        {r.shortage && (
                          <Badge variant="destructive" className="text-[10px]" title="승인된 휴가가 발생분으로 차감되지 않았습니다. 상세에서 데이터를 점검하세요.">
                            차감 정합 필요
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-normal text-sm">
                      {r.department || "—"}
                      {r.position ? ` · ${r.position}` : ""}
                    </TableCell>
                    <TableCell className="tabular-nums text-sm">{r.joinDate.slice(0, 10)}</TableCell>
                    <TableCell className="text-sm">{tenureText(r.tenureYears, r.tenureExtraMonths)}</TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {fmt1(r.remaining)}일
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {r.compensationOwedDays > 0.0001 ? (
                        <span className="font-medium tabular-nums text-amber-700 dark:text-amber-400">
                          {fmt1(r.compensationOwedDays)}일
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Link
                        href={`/admin/employee-leave-summary/${r.userId}`}
                        className="text-primary text-sm hover:underline"
                      >
                        상세보기 →
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
