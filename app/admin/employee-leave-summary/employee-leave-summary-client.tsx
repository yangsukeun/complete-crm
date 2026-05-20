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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import Link from "next/link";

type AccrualLineSnapshot = {
  accrualDateYmd: string;
  days: number;
  consumedDays: number;
  isExpired: boolean;
};

type AccrualLinesByBucket = {
  monthlyUnderOneYear: AccrualLineSnapshot[];
  annualAfterOneYear: AccrualLineSnapshot[];
  tenureBonus: AccrualLineSnapshot[];
};

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
  priorCrmUsageDays: number;
  annualCarryOverDaysReported: number;
  totalUsed: number;
  totalExpired: number;
  remaining: number;
  compensationOwedDays: number;
  nextAccrualDate: string | null;
  nextExpirationDate: string | null;
  poolMathConsistent: boolean;
  accrualLines: AccrualLinesByBucket;
};

type Api = { year: number; rows: Row[] };

function fmt1(n: number): string {
  return n.toFixed(n % 1 === 0 ? 0 : 1);
}

function ymdRange(lines: AccrualLineSnapshot[]): string {
  if (lines.length === 0) return "—";
  const ymds = lines.map((l) => l.accrualDateYmd).sort();
  return `${ymds[0]} ~ ${ymds[ymds.length - 1]}`;
}

function BucketHoverCell({
  label,
  employeeName,
  b,
  lines,
  extraFooter,
}: {
  label: string;
  employeeName: string;
  b: Bd;
  lines: AccrualLineSnapshot[];
  extraFooter?: string;
}) {
  const available = b.available;
  const entitled = b.entitled;
  const countNote =
    label.includes("월차") && lines.length > 0 ? `(매월 1일씩 ${lines.length}회)` : "";

  const detailLines = lines.slice(0, 6).map((l) => (
    <div key={l.accrualDateYmd + l.consumedDays} className="text-muted-foreground flex justify-between gap-2 text-xs">
      <span>{l.accrualDateYmd}</span>
      <span>
        {fmt1(l.consumedDays)}/{fmt1(l.days)}일
      </span>
    </div>
  ));

  return (
    <HoverCard openDelay={180} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="hover:bg-muted/40 cursor-help rounded-md px-1 py-1 text-right transition-colors">
          <div className="text-base font-semibold tabular-nums">{fmt1(available)}일</div>
          <div className="text-muted-foreground text-xs tabular-nums">/ {fmt1(entitled)}일 발생</div>
        </div>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="space-y-2 text-xs">
        <div className="border-b pb-2 font-medium">
          {label}
          <span className="text-muted-foreground font-normal"> ({employeeName})</span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between gap-4">
            <span>총 발생</span>
            <span className="tabular-nums font-medium">{fmt1(entitled)}일</span>
          </div>
          <div className="flex justify-between gap-4 pl-2">
            <span>├ 사용</span>
            <span className="tabular-nums">{fmt1(b.consumed)}일</span>
          </div>
          <div className="flex justify-between gap-4 pl-2">
            <span>├ 만료</span>
            <span className="tabular-nums">{fmt1(b.expired)}일</span>
          </div>
          <div className="flex justify-between gap-4 pl-2">
            <span>└ 잔여</span>
            <span className="tabular-nums font-medium">{fmt1(available)}일</span>
          </div>
        </div>
        <div className="border-t pt-2">
          <div className="text-muted-foreground mb-1">발생 내역</div>
          <div className="tabular-nums">{ymdRange(lines)}</div>
          {countNote ? <div className="text-muted-foreground mt-0.5">{countNote}</div> : null}
          {lines.length > 6 ? <div className="text-muted-foreground mt-1">상위 6건만 표시…</div> : null}
          {detailLines}
        </div>
        {extraFooter ? <div className="text-muted-foreground border-t pt-2 text-[11px] leading-snug">{extraFooter}</div> : null}
      </HoverCardContent>
    </HoverCard>
  );
}

function RowTotalsHover({
  employeeName,
  r,
}: {
  employeeName: string;
  r: Row;
}) {
  const ok = r.poolMathConsistent;
  const carryNote =
    r.annualCarryOverDaysReported > 0.0001
      ? `전년 이월(LeaveBalance 표기): ${fmt1(r.annualCarryOverDaysReported)}일`
      : undefined;
  return (
    <HoverCard openDelay={180}>
      <HoverCardTrigger asChild>
        <div className="hover:bg-muted/40 cursor-help rounded-md px-1 py-1 text-right">
          <div className="text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            {fmt1(r.remaining)}일
          </div>
          <div className="text-muted-foreground text-[10px]">행 합계 · 호버</div>
        </div>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="space-y-2 text-xs">
        <div className="font-medium">
          사용 가능 잔여 <span className="text-muted-foreground font-normal">({employeeName})</span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between gap-4">
            <span>총 사용 (accrual)</span>
            <span className="tabular-nums">{fmt1(r.totalUsed)}일</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>만료</span>
            <span className="tabular-nums">{fmt1(r.totalExpired)}일</span>
          </div>
          <div className="flex justify-between gap-4 border-t pt-1 font-medium">
            <span>표시 잔여</span>
            <span className="tabular-nums text-emerald-700 dark:text-emerald-400">{fmt1(r.remaining)}일</span>
          </div>
        </div>
        <div className="text-muted-foreground border-t pt-2 text-[11px] leading-relaxed">
          이전 사용분 {fmt1(r.priorCrmUsageDays)}일은 참고용이며, 풀 합산에는 포함되지 않습니다. 실제 차감은 발생분
          FIFO로 반영됩니다.
        </div>
        {carryNote ? <div className="text-muted-foreground text-[11px]">{carryNote}</div> : null}
        <div className={ok ? "text-emerald-600" : "text-destructive"}>
          산수 검증(발생분만): {ok ? "총발생 ≈ 사용 + 만료 + 잔여" : "불일치 — 데이터를 확인하세요"}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function PriorUsageCell({ days }: { days: number }) {
  if (days <= 0.0001) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <HoverCard openDelay={180}>
      <HoverCardTrigger asChild>
        <div className="hover:bg-muted/40 cursor-help rounded-md px-1 py-1 text-right">
          <div className="text-base font-semibold tabular-nums">{fmt1(days)}일</div>
          <div className="text-muted-foreground text-[10px]">참고</div>
        </div>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="text-xs leading-relaxed">
        <div className="font-medium">이전 사용분 (CRM 도입 전)</div>
        <p className="text-muted-foreground mt-2">
          직원 관리에 입력된 <strong>실제 사용 차감</strong> 합계입니다. 연차 풀에 더해지지 않으며, 가장 오래된
          발생분부터 FIFO로 소진 처리됩니다.
        </p>
      </HoverCardContent>
    </HoverCard>
  );
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
          description="각 칸은 사용 가능 일수(큰 숫자)와 총 발생(작은 회색)입니다. 총 사용·만료는 호버로 확인하세요. 이전 사용분은 CRM 도입 전 차감 참고값이며 풀 합산에 포함되지 않습니다."
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
            <Table className="w-full min-w-[880px] table-fixed text-sm">
              <colgroup>
                <col style={{ width: 90 }} />
                <col style={{ width: 180 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 48 }} />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[7rem]">이름</TableHead>
                  <TableHead className="min-w-[8rem]">부서 / 직책</TableHead>
                  <TableHead className="w-[5.5rem] text-right">근속</TableHead>
                  <TableHead className="text-right">
                    1년차 월차
                    <div className="text-muted-foreground font-normal">(월별 1일)</div>
                  </TableHead>
                  <TableHead className="text-right">
                    정규 연차
                    <div className="text-muted-foreground font-normal">(1년 만근)</div>
                  </TableHead>
                  <TableHead className="text-right">
                    근속가산
                    <div className="text-muted-foreground font-normal">(3년+)</div>
                  </TableHead>
                  <TableHead className="text-right">
                    이전 사용분
                    <div className="text-muted-foreground font-normal">(CRM 전)</div>
                  </TableHead>
                  <TableHead className="text-right font-semibold">
                    사용 가능 잔여
                    <div className="text-muted-foreground font-normal">(일)</div>
                  </TableHead>
                  <TableHead className="text-right">
                    보상 대상
                    <div className="text-muted-foreground font-normal">(만료)</div>
                  </TableHead>
                  <TableHead className="w-[3rem] text-center">검증</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.userId}>
                    <TableCell className="cursor-help align-top" title={r.email}>
                      <div className="font-medium">{r.name}</div>
                    </TableCell>
                    <TableCell className="max-w-[11rem] whitespace-normal align-top text-sm">
                      {[r.department, r.position].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell
                      className="text-right text-sm tabular-nums align-top"
                      title={`입사 ${r.joinDate.slice(0, 10)} · ${r.role}`}
                    >
                      {r.tenureYears}년{r.tenureExtraMonths > 0 ? ` ${r.tenureExtraMonths}개월` : ""}
                    </TableCell>
                    <TableCell className="align-top">
                      <BucketHoverCell
                        label="1년차 월차 (월별 1일)"
                        employeeName={r.name}
                        b={r.monthlyUnderOneYear}
                        lines={r.accrualLines.monthlyUnderOneYear}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <BucketHoverCell
                        label="정규 연차 (1년 만근)"
                        employeeName={r.name}
                        b={r.annualAfterOneYear}
                        lines={r.accrualLines.annualAfterOneYear}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <BucketHoverCell
                        label="근속가산 (3년+)"
                        employeeName={r.name}
                        b={r.tenureBonus}
                        lines={r.accrualLines.tenureBonus}
                      />
                    </TableCell>
                    <TableCell className="align-top text-right">
                      <PriorUsageCell days={r.priorCrmUsageDays} />
                    </TableCell>
                    <TableCell className="align-top">
                      <RowTotalsHover employeeName={r.name} r={r} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums align-top text-amber-800 dark:text-amber-400">
                      {fmt1(r.compensationOwedDays)}일
                    </TableCell>
                    <TableCell className="align-middle text-center text-lg">
                      {r.poolMathConsistent ? (
                        <span className="text-emerald-600" title="총발생 ≈ 사용 + 만료 + 잔여">
                          ✓
                        </span>
                      ) : (
                        <span className="text-destructive" title="총발생 ≠ 사용 + 만료 + 잔여">
                          ⚠
                        </span>
                      )}
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
