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

type Row = {
  userId: string;
  name: string;
  email: string;
  department: string | null;
  position: string | null;
  role: string;
  joinDate: string;
  year: number;
  annualGranted: number;
  annualCarryOver: number;
  annualUsed: number;
  manualDeduction: number;
  totalAvailable: number;
  remaining: number;
};

type Api = { year: number; rows: Row[] };

export function EmployeeLeaveSummaryClient() {
  const { data, error, isLoading, mutate } = useSWR<Api>("/api/admin/employee-leave-summary", jsonFetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeadline
          title="직원 연차·월차 현황"
          description="입사일(KST)과 근로기준법 간이 산식으로 부여일을 계산합니다. 저장된 사용·차감·이월과 합쳐 잔여를 표시합니다."
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
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>이메일</TableHead>
                  <TableHead>부서 / 직책</TableHead>
                  <TableHead>역할</TableHead>
                  <TableHead>입사일</TableHead>
                  <TableHead className="text-right">부여(간이)</TableHead>
                  <TableHead className="text-right">이월</TableHead>
                  <TableHead className="text-right">사용(승인)</TableHead>
                  <TableHead className="text-right">실사용차감</TableHead>
                  <TableHead className="text-right font-semibold">잔여</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.userId}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">{r.email}</TableCell>
                    <TableCell className="text-sm">
                      {[r.department, r.position].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.role}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm tabular-nums">
                      {r.joinDate.slice(0, 10)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.annualGranted.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.annualCarryOver.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.annualUsed.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.manualDeduction.toFixed(1)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {r.remaining.toFixed(1)}일
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
