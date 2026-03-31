"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardSalesStats } from "@/lib/dashboard-sales";
import useSWR from "swr";
import { FileText, Wallet, AlertCircle } from "lucide-react";
import { jsonFetcher, SWR_KEYS } from "@/lib/api-swr";

function formatAmount(n: number) {
  return new Intl.NumberFormat("ko-KR").format(n) + "원";
}

export function DashboardSalesSection({
  fallbackData,
}: {
  fallbackData: DashboardSalesStats;
}) {
  const { data } = useSWR<DashboardSalesStats>(SWR_KEYS.dashboardSales, jsonFetcher, {
    fallbackData,
    revalidateOnFocus: true,
  });
  if (!data) return null;
  const { currentMonth, monthly } = data;

  return (
    <section className="mt-8 border-t border-slate-200 pt-8 dark:border-slate-800">
      <h2 className="mb-4 text-lg font-semibold">매출 및 수금 통계</h2>

      {/* 1. 핵심 요약 카드 3개 */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <FileText className="size-5" />
            <span className="text-sm">이번 달 총 견적 금액</span>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {formatAmount(currentMonth.totalQuotation)}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">거절·초안 제외</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wallet className="size-5" />
            <span className="text-sm">이번 달 실제 입금 완료 금액</span>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatAmount(currentMonth.paymentCompleted)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="size-5" />
            <span className="text-sm">미수금 잔액</span>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-red-600 dark:text-red-400">
            {formatAmount(currentMonth.awaitingPayment)}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">입금대기만 (거절 제외)</p>
        </div>
      </div>

      {/* 2. 월별 막대 그래프 (최근 6개월) - 고정 크기로 grid/flex min-width 경고 방지 */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <p className="text-muted-foreground mb-4 text-sm">최근 6개월 총 견적 vs 입금 완료</p>
        <div style={{ width: "100%", height: 280, minHeight: 280, boxSizing: "border-box" }}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={monthly}
              margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
              <XAxis
                dataKey="monthLabel"
                tick={{ fontSize: 12 }}
                className="text-slate-600 dark:text-slate-400"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(v: any) => (v >= 10000 ? `${v / 10000}만` : String(v))}
                className="text-slate-600 dark:text-slate-400"
              />
              <Tooltip
                formatter={((value: number | undefined, name: string | undefined) => [
                  formatAmount(value ?? 0),
                  name ?? "",
                ]) as any}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.monthLabel ?? ""}
                contentStyle={{ borderRadius: 8 }}
              />
              <Legend />
              <Bar
                dataKey="totalQuotation"
                name="총 견적 금액"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="paymentCompleted"
                name="입금 완료 금액"
                fill="hsl(142, 76%, 36%)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
