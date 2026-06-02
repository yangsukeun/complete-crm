import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { completedFullMonthsSinceJoinKst } from "@/lib/leave";
import { calculateLeavePool } from "@/lib/leave/calculate-pool";
import { leaveRequestDays } from "@/lib/leave/leave-request-days";
import { LEGACY_CARRY_ACCRUAL_YMD } from "@/lib/leave/legacy-carry-sync";
import { toKstYmd } from "@/lib/date-kst";

type AllocationRow = { days: number; accrualId: string };

function parseAllocations(raw: unknown): AllocationRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is AllocationRow =>
      typeof x === "object" &&
      x !== null &&
      typeof (x as AllocationRow).accrualId === "string" &&
      typeof (x as AllocationRow).days === "number"
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const role = String(session.user.role ?? "").toUpperCase();
    if (role !== "EXECUTIVE" && role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId } = await params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        joinDate: true,
        department: true,
        position: true,
        role: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const asOf = new Date();
    const joinDate = user.joinDate instanceof Date ? user.joinDate : new Date(user.joinDate);
    const joinYmd = toKstYmd(joinDate);
    const asOfYmd = toKstYmd(asOf);
    const fullMonths = joinYmd ? completedFullMonthsSinceJoinKst(joinYmd, asOfYmd) : 0;
    const tenureYears = Math.floor(fullMonths / 12);
    const tenureExtraMonths = fullMonths % 12;

    const [accruals, requests, balances, pool] = await Promise.all([
      prisma.leaveAccrual.findMany({
        where: { userId: user.id },
        orderBy: { accrualDateYmd: "asc" },
      }),
      prisma.leaveRequest.findMany({
        where: { userId: user.id },
        orderBy: { startDate: "desc" },
      }),
      prisma.leaveBalance.findMany({
        where: { userId: user.id },
        orderBy: { year: "desc" },
      }),
      calculateLeavePool(user.id, asOf),
    ]);

    const accrualYmdById = new Map(accruals.map((a) => [a.id, a.accrualDateYmd]));

    return NextResponse.json({
      user: {
        ...user,
        joinDate: joinDate.toISOString(),
      },
      tenureYears,
      tenureExtraMonths,
      accruals: accruals.map((a) => ({
        id: a.id,
        type: a.type,
        accrualDateYmd: a.accrualDateYmd,
        days: a.days,
        consumedDays: a.consumedDays,
        isExpired: a.isExpired,
        compensationOwed: a.compensationOwed,
        accruedAt: a.accruedAt.toISOString(),
        expiresAt: a.expiresAt.toISOString(),
        isLegacyCarry: a.type === "CARRY_OVER" && a.accrualDateYmd === LEGACY_CARRY_ACCRUAL_YMD,
      })),
      requests: requests.map((r) => {
        const allocs = parseAllocations(r.accrualAllocations);
        return {
          id: r.id,
          type: r.type,
          status: r.status,
          startDate: r.startDate.toISOString(),
          endDate: r.endDate.toISOString(),
          createdAt: r.createdAt.toISOString(),
          reason: r.reason,
          days: leaveRequestDays(r.type, r.startDate, r.endDate),
          allocations: allocs.map((x) => ({
            days: x.days,
            accrualId: x.accrualId,
            accrualDateYmd: accrualYmdById.get(x.accrualId) ?? null,
          })),
        };
      }),
      balances: balances.map((b) => ({
        year: b.year,
        manualDeduction: b.manualDeduction,
        annualUsed: b.annualUsed,
        annualCarryOver: b.annualCarryOver,
        annualTotal: b.annualTotal,
      })),
      pool: {
        available: pool.available,
        totalEntitled: pool.totalEntitled,
        totalConsumed: pool.totalConsumedDaysFromAccruals,
        totalExpired: pool.totalExpired,
        compensationOwedDays: pool.compensationOwedDays,
        priorCrmUsageDays: pool.priorCrmUsageDays,
        annualCarryOverDaysReported: pool.annualCarryOverDaysReported,
        poolMathConsistent: pool.poolMathConsistent,
        leaveShortage: pool.leaveShortage,
        shortageLeaveRequestIds: pool.shortageLeaveRequestIds,
        breakdown: pool.breakdown,
        nextAccrualDate: pool.nextAccrualDate?.toISOString() ?? null,
        nextExpirationDate: pool.nextExpirationDate?.toISOString() ?? null,
      },
    });
  } catch (e) {
    console.error("[employee-leave-detail]", e);
    return NextResponse.json({ error: "상세를 불러올 수 없습니다." }, { status: 500 });
  }
}
