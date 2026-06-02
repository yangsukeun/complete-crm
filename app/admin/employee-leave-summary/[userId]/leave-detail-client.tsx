"use client";

import useSWR from "swr";
import Link from "next/link";
import { jsonFetcher } from "@/lib/api-swr";
import {
  leaveAccrualTypeLabel,
  leaveRequestStatusLabel,
  leaveRequestTypeLabel,
  roleLabel,
} from "@/lib/leave/display-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AccrualRow = {
  id: string;
  type: string;
  accrualDateYmd: string;
  days: number;
  consumedDays: number;
  isExpired: boolean;
  compensationOwed: boolean;
  expiresAt: string;
  isLegacyCarry: boolean;
};

type RequestRow = {
  id: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  days: number;
  allocations: Array<{ days: number; accrualId: string; accrualDateYmd: string | null }>;
};

type BalanceRow = {
  year: number;
  manualDeduction: number;
  annualUsed: number;
  annualCarryOver: number;
  annualTotal: number;
};

type PoolPayload = {
  available: number;
  totalEntitled: number;
  totalConsumed: number;
  totalExpired: number;
  compensationOwedDays: number;
  priorCrmUsageDays: number;
  annualCarryOverDaysReported: number;
  poolMathConsistent: boolean;
  leaveShortage?: boolean;
  shortageLeaveRequestIds?: string[];
};

type DetailApi = {
  user: {
    id: string;
    name: string;
    email: string;
    joinDate: string;
    department: string | null;
    position: string | null;
    role: string;
  };
  tenureYears: number;
  tenureExtraMonths: number;
  accruals: AccrualRow[];
  requests: RequestRow[];
  balances: BalanceRow[];
  pool: PoolPayload;
};

function fmt1(n: number): string {
  return n.toFixed(n % 1 === 0 ? 0 : 1);
}

function tenureText(years: number, extraMonths: number): string {
  return `${years}년${extraMonths > 0 ? ` ${extraMonths}개월` : ""}`;
}

function SummaryCard({
  label,
  value,
  highlight,
  warning,
  muted,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  warning?: boolean;
  muted?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p
          className={`mt-1 text-xl font-semibold tabular-nums ${
            highlight
              ? "text-emerald-700 dark:text-emerald-400"
              : warning
                ? "text-amber-700 dark:text-amber-400"
                : muted
                  ? "text-muted-foreground"
                  : ""
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "APPROVED"
      ? "default"
      : status === "REJECTED" || status === "CANCELLED"
        ? "destructive"
        : "secondary";
  return <Badge variant={variant}>{leaveRequestStatusLabel(status)}</Badge>;
}

function PoolTable({ accruals }: { accruals: AccrualRow[] }) {
  if (accruals.length === 0) {
    return <p className="text-muted-foreground text-sm">표시할 발생 내역이 없습니다.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>발생일</TableHead>
            <TableHead>구분</TableHead>
            <TableHead className="text-right">발생량</TableHead>
            <TableHead className="text-right">사용</TableHead>
            <TableHead className="text-right">잔여</TableHead>
            <TableHead>만료일</TableHead>
            <TableHead>상태</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accruals.map((a) => {
            const remaining = Math.max(0, a.days - a.consumedDays);
            return (
              <TableRow key={a.id}>
                <TableCell className="tabular-nums">{a.accrualDateYmd}</TableCell>
                <TableCell>{leaveAccrualTypeLabel(a.type)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt1(a.days)}일</TableCell>
                <TableCell className="text-right tabular-nums">{fmt1(a.consumedDays)}일</TableCell>
                <TableCell
                  className={`text-right tabular-nums ${remaining > 0.0001 ? "font-semibold" : "text-muted-foreground"}`}
                >
                  {fmt1(remaining)}일
                </TableCell>
                <TableCell className="tabular-nums text-sm">{a.expiresAt.slice(0, 10)}</TableCell>
                <TableCell>
                  {a.isExpired ? (
                    <span className="text-destructive text-sm">만료</span>
                  ) : (
                    <span className="text-emerald-600 text-sm dark:text-emerald-400">활성</span>
                  )}
                  {a.compensationOwed ? (
                    <span className="text-muted-foreground ml-1 text-xs">(수당)</span>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function RequestsTable({ requests }: { requests: RequestRow[] }) {
  if (requests.length === 0) {
    return <p className="text-muted-foreground text-sm">신청 내역이 없습니다.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>신청일</TableHead>
            <TableHead>기간</TableHead>
            <TableHead>구분</TableHead>
            <TableHead className="text-right">일수</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>차감 풀</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((r) => {
            const start = r.startDate.slice(0, 10);
            const end = r.endDate.slice(0, 10);
            const allocText =
              r.allocations.length > 0
                ? r.allocations
                    .map((x) => `${fmt1(x.days)}일 / ${x.accrualDateYmd ?? x.accrualId.slice(0, 8)}`)
                    .join(", ")
                : "—";
            return (
              <TableRow key={r.id}>
                <TableCell className="tabular-nums text-sm">{r.createdAt.slice(0, 10)}</TableCell>
                <TableCell className="tabular-nums text-sm">
                  {start}
                  {start !== end ? ` ~ ${end}` : ""}
                </TableCell>
                <TableCell>{leaveRequestTypeLabel(r.type)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt1(r.days)}일</TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell className="text-muted-foreground max-w-[14rem] text-xs">{allocText}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ConsistencyBlock({ pool }: { pool: PoolPayload }) {
  const { totalEntitled, totalConsumed, totalExpired, available, poolMathConsistent } = pool;
  const isOk = poolMathConsistent;

  return (
    <div className="bg-muted/40 space-y-3 rounded-lg p-4">
      <Table>
        <TableBody>
          <TableRow>
            <TableCell className="border-0">총 발생</TableCell>
            <TableCell className="border-0 text-right tabular-nums">{fmt1(totalEntitled)}일</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="border-0">− 사용</TableCell>
            <TableCell className="border-0 text-right tabular-nums">{fmt1(totalConsumed)}일</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="border-0">− 만료</TableCell>
            <TableCell className="border-0 text-right tabular-nums">{fmt1(totalExpired)}일</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="border-0 font-semibold">= 잔여</TableCell>
            <TableCell className="border-0 text-right font-semibold tabular-nums">{fmt1(available)}일</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p className={`text-sm ${isOk ? "text-emerald-600" : "text-destructive"}`}>
        {isOk ? "✓ 산수 일치" : "⚠ 산수 불일치 — 데이터 점검 필요"}
      </p>
      {pool.priorCrmUsageDays > 0.0001 && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          이전 사용분(CRM 전) {fmt1(pool.priorCrmUsageDays)}일 — 풀 합산·위 산수에 포함되지 않음 (참고)
        </p>
      )}
    </div>
  );
}

function BalanceTable({ balances }: { balances: BalanceRow[] }) {
  if (balances.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>연도</TableHead>
            <TableHead className="text-right">manualDeduction</TableHead>
            <TableHead className="text-right">annualUsed</TableHead>
            <TableHead className="text-right">이월</TableHead>
            <TableHead className="text-right">annualTotal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {balances.map((b) => (
            <TableRow key={b.year}>
              <TableCell>{b.year}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt1(b.manualDeduction)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt1(b.annualUsed)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt1(b.annualCarryOver)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt1(b.annualTotal)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function LeaveDetailClient({ userId }: { userId: string }) {
  const { data, error, isLoading, mutate } = useSWR<DetailApi>(
    `/api/admin/employee-leave-detail/${userId}`,
    jsonFetcher,
    { revalidateOnFocus: true }
  );

  if (isLoading && !data) {
    return <p className="text-muted-foreground text-sm">불러오는 중…</p>;
  }
  if (error || !data) {
    return (
      <div className="space-y-4">
        <p className="text-destructive text-sm">상세를 불러오지 못했습니다.</p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/employee-leave-summary">← 목록으로</Link>
        </Button>
      </div>
    );
  }

  const { user, accruals, requests, balances, pool, tenureYears, tenureExtraMonths } = data;
  const poolAccruals = accruals.filter((a) => !a.isLegacyCarry);
  const legacyAccruals = accruals.filter((a) => a.isLegacyCarry);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/employee-leave-summary" className="text-primary text-sm hover:underline">
          ← 목록으로
        </Link>
        <Button type="button" variant="outline" size="sm" onClick={() => void mutate()}>
          새로고침
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{user.name}</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-1 text-sm">
          <div>{user.email}</div>
          <div>
            {user.department ?? "—"}
            {user.position ? ` · ${user.position}` : ""}
          </div>
          <div>
            입사 {user.joinDate.slice(0, 10)} · 근속 {tenureText(tenureYears, tenureExtraMonths)}
          </div>
          <div>역할: {roleLabel(user.role)}</div>
        </CardContent>
      </Card>

      {pool.leaveShortage && (
        <div className="border-destructive/40 bg-destructive/5 text-destructive flex flex-wrap items-center gap-2 rounded-lg border p-4 text-sm">
          <Badge variant="destructive" className="text-[10px]">차감 정합 필요</Badge>
          <span>
            승인된 휴가 중 발생분(accrual)으로 차감되지 못한 건이 있습니다
            {pool.shortageLeaveRequestIds && pool.shortageLeaveRequestIds.length > 0
              ? ` (요청 ${pool.shortageLeaveRequestIds.length}건)`
              : ""}
            . 아래 발생/신청 내역을 대조해 데이터를 점검하세요.
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="사용 가능 잔여" value={`${fmt1(pool.available)}일`} highlight />
        <SummaryCard label="올해 사용(발생분)" value={`${fmt1(pool.totalConsumed)}일`} />
        <SummaryCard label="만료 손실" value={`${fmt1(pool.totalExpired)}일`} muted />
        <SummaryCard
          label="수당 대상"
          value={`${fmt1(pool.compensationOwedDays)}일`}
          warning={pool.compensationOwedDays > 0}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">발생 내역 (풀별)</h2>
        <PoolTable accruals={poolAccruals} />
        {legacyAccruals.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-muted-foreground text-sm font-medium">레거시 이월 (1900-01-01, 풀 제외)</h3>
            <PoolTable accruals={legacyAccruals} />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">사용 신청 ({requests.length}건)</h2>
        <RequestsTable requests={requests} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">LeaveBalance (연도별)</h2>
        <BalanceTable balances={balances} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">산수 검증</h2>
        <ConsistencyBlock pool={pool} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">관리</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/employees">직원 관리 (이전 사용분·입사일)</Link>
          </Button>
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          FIFO 재차감은 서버 스크립트(reapply-consumption)로 실행합니다. 이 화면에서는 데이터 조회만 합니다.
        </p>
      </section>
    </div>
  );
}
