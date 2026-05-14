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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type Bd = {
  available: number;
  entitled: number;
  consumed: number;
  expired: number;
};

type Row = {
  userId: string;
  name: string;
  email: string;
  department: string | null;
  position: string | null;
  role: string;
  joinDate: string;
  year: number;
  tenureYears: number;
  tenureExtraMonths: number;
  monthlyUnderOneYear: Bd;
  annualAfterOneYear: Bd;
  tenureBonus: Bd;
  carryOver: Bd;
  totalUsed: number;
  totalExpired: number;
  remaining: number;
  compensationOwedDays: number;
  nextAccrualDate: string | null;
  nextExpirationDate: string | null;
};

type Api = { year: number; rows: Row[] };

function fmtPair(b: Bd): string {
  return `${b.available.toFixed(1)}/${b.entitled.toFixed(1)}`;
}

function hoverDetail(label: string, b: Bd, nextExp: string | null, nextAcc: string | null): string {
  const parts = [
    `${label}`,
    `부여 ${b.entitled.toFixed(1)}일`,
    `사용 ${b.consumed.toFixed(1)}일`,
    `소멸 ${b.expired.toFixed(1)}일`,
    `잔여 ${b.available.toFixed(1)}일`,
  ];
  if (nextExp) parts.push(`가장 임박 소멸: ${nextExp.slice(0, 10)}`);
  if (nextAcc) parts.push(`다음 발생 예정: ${nextAcc.slice(0, 10)}`);
  return parts.join(" · ");
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
          description="입사기념일(KST) 기준 발생·소멸(365일) 및 FIFO 사용을 반영합니다. 셀에 마우스를 올리면 세부 수치를 볼 수 있습니다."
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
          <div className="w-full rounded-lg border shadow-sm">
            <Table className="w-full min-w-[1500px] table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[70px]" />
                <col className="w-[180px]" />
                <col className="w-[140px]" />
                <col className="w-[90px]" />
                <col className="w-[100px]" />
                <col className="w-[80px]" />
                <col className="w-[90px]" />
                <col className="w-[90px]" />
                <col className="w-[80px]" />
                <col className="w-[80px]" />
                <col className="w-[70px]" />
                <col className="w-[70px]" />
                <col className="w-[70px]" />
                <col className="w-[80px]" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>이메일</TableHead>
                  <TableHead>부서 / 직책</TableHead>
                  <TableHead>역할</TableHead>
                  <TableHead>입사일</TableHead>
                  <TableHead className="text-right">근속</TableHead>
                  <TableHead className="text-right">1년차월차</TableHead>
                  <TableHead className="text-right">정규연차</TableHead>
                  <TableHead className="text-right">근속가산</TableHead>
                  <TableHead className="text-right">이월</TableHead>
                  <TableHead className="text-right">사용계</TableHead>
                  <TableHead className="text-right">소멸계</TableHead>
                  <TableHead className="text-right font-semibold">잔여</TableHead>
                  <TableHead className="text-right">수당대상</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.userId}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="max-w-0 min-w-0 p-2">
                      <span className="block truncate text-muted-foreground" title={r.email}>
                        {r.email}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-normal text-sm">
                      {[r.department, r.position].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.role}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm tabular-nums">
                      {r.joinDate.slice(0, 10)}
                    </TableCell>
                    <TableCell
                      className="text-right text-sm tabular-nums"
                      title={`근속 ${r.tenureYears}년${r.tenureExtraMonths ? ` ${r.tenureExtraMonths}개월` : ""} (입사일 기준)`}
                    >
                      {r.tenureYears}년{r.tenureExtraMonths > 0 ? ` ${r.tenureExtraMonths}개월` : ""}
                    </TableCell>
                    <TableCell
                      className="text-right tabular-nums text-sm"
                      title={hoverDetail("60조② 월차(1년 미만)", r.monthlyUnderOneYear, r.nextExpirationDate, r.nextAccrualDate)}
                    >
                      {fmtPair(r.monthlyUnderOneYear)}
                    </TableCell>
                    <TableCell
                      className="text-right tabular-nums text-sm"
                      title={hoverDetail("60조① 정규연차", r.annualAfterOneYear, r.nextExpirationDate, r.nextAccrualDate)}
                    >
                      {fmtPair(r.annualAfterOneYear)}
                    </TableCell>
                    <TableCell
                      className="text-right tabular-nums text-sm"
                      title={hoverDetail("60조④ 근속가산", r.tenureBonus, r.nextExpirationDate, r.nextAccrualDate)}
                    >
                      {fmtPair(r.tenureBonus)}
                    </TableCell>
                    <TableCell
                      className="text-right tabular-nums text-sm"
                      title={hoverDetail("이월·실사용차감", r.carryOver, r.nextExpirationDate, r.nextAccrualDate)}
                    >
                      {fmtPair(r.carryOver)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.totalUsed.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.totalExpired.toFixed(1)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {r.remaining.toFixed(1)}일
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-amber-700 dark:text-amber-400">
                      {r.compensationOwedDays.toFixed(1)}일
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
