"use client";

import { useMemo, useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";

type Row = {
  userId: string;
  name: string;
  department: string | null;
  position: string | null;
  joinDate: string;
  periodStart: string;
  periodEnd: string;
  tenureYears: number;
  tenureExtraMonths: number;
  totalGranted: number;
  totalUsed: number;
  remaining: number;
  carryOver: { entitled: number };
  compensationOwedDays: number;
  shortage?: boolean;
  accountDisabled?: boolean;
};

type Api = {
  year: number;
  scope: "all" | "cs";
  departments: string[];
  lockedDepartment: string | null;
  stats: { totalGranted: number; totalUsed: number; usageRate: number };
  rows: Row[];
};

function fmt1(n: number): string {
  return n.toFixed(n % 1 === 0 ? 0 : 1);
}

export function EmployeeLeaveSummaryClient() {
  const [dept, setDept] = useState("CS팀");
  const qs = dept === "__ALL__" ? "department=__ALL__" : `department=${encodeURIComponent(dept)}`;
  const { data, error, isLoading, mutate } = useSWR<Api>(
    `/api/admin/employee-leave-summary?${qs}`,
    jsonFetcher,
    { revalidateOnFocus: true, dedupingInterval: 30_000 }
  );

  const locked = data?.lockedDepartment ?? null;
  const filterValue = locked ?? dept;

  const stats = useMemo(() => {
    if (!data) return { totalGranted: 0, totalUsed: 0, usageRate: 0 };
    return data.stats;
  }, [data]);

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeadline
          title="직원 연차·월차 현황"
          description="발생·사용·잔여를 한눈에 보고, 풀·신청·조정은 상세보기에서 확인하세요."
        />
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void mutate()}>
            새로고침
          </Button>
          {data?.scope === "all" && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/employees">직원 관리</Link>
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-destructive text-sm">불러오지 못했습니다.</p>}
      {isLoading && !data && <p className="text-muted-foreground text-sm">불러오는 중…</p>}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-muted-foreground text-sm font-medium">전체 발생 연차</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{fmt1(stats.totalGranted)}일</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-muted-foreground text-sm font-medium">전체 사용 연차</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{fmt1(stats.totalUsed)}일</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-muted-foreground text-sm font-medium">연차 사용률</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{fmt1(stats.usageRate)}%</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <p className="text-muted-foreground text-sm">
              기준 연도: <strong className="text-foreground">{data.year}</strong>년 · 직원 {data.rows.length}명
            </p>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">부서</span>
              <Select
                value={filterValue}
                onValueChange={(v) => setDept(v)}
                disabled={Boolean(locked)}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {!locked && <SelectItem value="__ALL__">전체</SelectItem>}
                  {(locked ? [locked] : data.departments.includes("CS팀")
                    ? ["CS팀", ...data.departments.filter((d) => d !== "CS팀")]
                    : data.departments
                  ).map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="w-full overflow-hidden rounded-lg border shadow-sm">
            <Table className="w-full text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>성명</TableHead>
                  <TableHead>직책</TableHead>
                  <TableHead>적용기간</TableHead>
                  <TableHead className="text-right">발생(이월)</TableHead>
                  <TableHead className="text-right">사용</TableHead>
                  <TableHead className="text-right">잔여</TableHead>
                  <TableHead className="text-center">상세</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => {
                  const carry = r.carryOver?.entitled ?? 0;
                  return (
                    <TableRow
                      key={r.userId}
                      className={r.shortage ? "bg-destructive/5 hover:bg-destructive/10" : "hover:bg-muted/50"}
                    >
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{r.name}</span>
                          {r.accountDisabled && (
                            <Badge variant="secondary" className="text-[10px]">
                              비활성
                            </Badge>
                          )}
                          {r.shortage && (
                            <Badge
                              variant="destructive"
                              className="text-[10px]"
                              title="승인된 휴가가 발생분으로 차감되지 않았습니다."
                            >
                              차감 정합 필요
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.position || "—"}</TableCell>
                      <TableCell className="tabular-nums text-sm">
                        {r.periodStart && r.periodEnd ? `${r.periodStart} ~ ${r.periodEnd}` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt1(r.totalGranted)}
                        {carry > 0.0001 ? (
                          <span className="text-muted-foreground"> (이월 {fmt1(carry)})</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt1(r.totalUsed)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {fmt1(r.remaining)}일
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
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
