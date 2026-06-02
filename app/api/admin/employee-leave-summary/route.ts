import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getCurrentLeaveCalendarYearKst, completedFullMonthsSinceJoinKst } from "@/lib/leave";
import { calculateLeavePool } from "@/lib/leave/calculate-pool";
import { toKstYmd } from "@/lib/date-kst";

type Bd = {
  available: number;
  entitled: number;
  consumed: number;
  expired: number;
};

/**
 * 대표·시스템 관리자: 전 직원 연차 풀(근기법 정합) 한눈에 조회.
 */
export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const role = String(session.user.role ?? "").toUpperCase();
    if (role !== "EXECUTIVE" && role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const year = getCurrentLeaveCalendarYearKst();
    const asOf = new Date();
    const asOfYmd = toKstYmd(asOf);

    const users = await prisma.user.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        position: true,
        role: true,
        joinDate: true,
      },
    });

    const rows = await Promise.all(
      users.map(async (u) => {
        const joinDate = u.joinDate instanceof Date ? u.joinDate : new Date(u.joinDate);
        const joinYmd = toKstYmd(joinDate);
        const fullMonths = joinYmd ? completedFullMonthsSinceJoinKst(joinYmd, asOfYmd) : 0;
        const tenureYears = Math.floor(fullMonths / 12);
        const tenureExtraMonths = fullMonths % 12;

        let pool;
        try {
          pool = await calculateLeavePool(u.id, asOf);
        } catch (perUser) {
          // [DIAG] 어느 직원의 풀 계산에서 터지는지 식별 (배포 후 Vercel 로그용)
          console.error(
            `[employee-leave-summary] calculateLeavePool failed userId=${u.id} name=${u.name}`,
            perUser
          );
          throw perUser;
        }
        const b = pool.breakdown;

        const bd = (x: typeof b.monthlyUnderOneYear): Bd => ({
          available: x.available,
          entitled: x.entitled,
          consumed: x.consumed,
          expired: x.expired,
        });

        return {
          userId: u.id,
          name: u.name,
          email: u.email,
          department: u.department,
          position: u.position,
          role: u.role,
          joinDate: joinDate.toISOString(),
          year,
          tenureYears,
          tenureExtraMonths,
          monthlyUnderOneYear: bd(b.monthlyUnderOneYear),
          annualAfterOneYear: bd(b.annualAfterOneYear),
          tenureBonus: bd(b.tenureBonus),
          carryOver: bd(b.carryOver),
          priorCrmUsageDays: pool.priorCrmUsageDays,
          annualCarryOverDaysReported: pool.annualCarryOverDaysReported,
          totalUsed: pool.totalConsumedDaysFromAccruals,
          totalExpired: pool.totalExpired,
          remaining: pool.available,
          compensationOwedDays: pool.compensationOwedDays,
          nextAccrualDate: pool.nextAccrualDate?.toISOString() ?? null,
          nextExpirationDate: pool.nextExpirationDate?.toISOString() ?? null,
          poolMathConsistent: pool.poolMathConsistent,
          shortage: pool.leaveShortage,
          accrualLines: pool.accrualLines,
        };
      })
    );

    return NextResponse.json({ year, rows });
  } catch (e) {
    // [DIAG] 실제 예외를 명확히 출력 (name/message/code/stack) — 배포 후 Vercel Functions 로그에서 확인
    const err = e as { name?: string; message?: string; code?: string; meta?: unknown; stack?: string };
    console.error("[employee-leave-summary] 500", {
      name: err?.name,
      message: err?.message,
      code: err?.code,
      meta: err?.meta,
    });
    console.error("[employee-leave-summary] stack", err?.stack);
    return NextResponse.json({ error: "목록을 불러올 수 없습니다." }, { status: 500 });
  }
}
