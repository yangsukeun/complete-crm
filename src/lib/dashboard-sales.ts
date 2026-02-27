import prisma from "@/lib/prisma";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import { ko } from "date-fns/locale";

export type DashboardSalesStats = {
  currentMonth: {
    totalQuotation: number;
    paymentCompleted: number;
    awaitingPayment: number;
  };
  monthly: Array<{
    monthKey: string;
    monthLabel: string;
    totalQuotation: number;
    paymentCompleted: number;
  }>;
};

/**
 * 견적서 발행일(issuedAt)·상태 기준 월별 매출·수금 통계.
 * 이번 달 요약 + 최근 6개월 차트용 데이터.
 */
export async function getDashboardSalesStats(): Promise<DashboardSalesStats> {
  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);

  const sixMonthsAgo = subMonths(thisMonthStart, 5);

  const quotations = await prisma.quotation.findMany({
    where: {
      issuedAt: { gte: sixMonthsAgo, lte: thisMonthEnd },
    },
    select: {
      issuedAt: true,
      finalAmount: true,
      status: true,
    },
  });

  const currentMonthQuotations = quotations.filter(
    (q: any) => q.issuedAt >= thisMonthStart && q.issuedAt <= thisMonthEnd
  );

  const currentMonth = {
    totalQuotation: currentMonthQuotations.reduce((sum, q) => sum + q.finalAmount, 0),
    paymentCompleted: currentMonthQuotations
      .filter((q: any) => q.status === "PAYMENT_COMPLETED")
      .reduce((sum, q) => sum + q.finalAmount, 0),
    awaitingPayment: currentMonthQuotations
      .filter((q: any) => q.status === "AWAITING_PAYMENT")
      .reduce((sum, q) => sum + q.finalAmount, 0),
  };

  const monthlyMap = new Map<
    string,
    { totalQuotation: number; paymentCompleted: number }
  >();

  for (let i = 0; i < 6; i++) {
    const m = subMonths(thisMonthStart, 5 - i);
    const key = format(m, "yyyy-MM");
    monthlyMap.set(key, { totalQuotation: 0, paymentCompleted: 0 });
  }

  for (const q of quotations) {
    const key = format(q.issuedAt, "yyyy-MM");
    const cur = monthlyMap.get(key);
    if (!cur) continue;
    cur.totalQuotation += q.finalAmount;
    if (q.status === "PAYMENT_COMPLETED") cur.paymentCompleted += q.finalAmount;
  }

  const monthly = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, values]) => ({
      monthKey,
      monthLabel: format(new Date(monthKey + "-01"), "M월", { locale: ko }),
      totalQuotation: values.totalQuotation,
      paymentCompleted: values.paymentCompleted,
    }));

  return { currentMonth, monthly };
}
