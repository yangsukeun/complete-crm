import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getCurrentLeaveCalendarYearKst, completedFullMonthsSinceJoinKst } from "@/lib/leave";
import { calculateLeavePool } from "@/lib/leave/calculate-pool";
import { toKstYmd } from "@/lib/date-kst";

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

        const pool = await calculateLeavePool(u.id, asOf);
        const b = pool.breakdown;

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
          monthlyUnderOneYear: {
            available: b.monthlyUnderOneYear.available,
            entitled: b.monthlyUnderOneYear.entitled,
            consumed: b.monthlyUnderOneYear.consumed,
            expired: b.monthlyUnderOneYear.expired,
          },
          annualAfterOneYear: {
            available: b.annualAfterOneYear.available,
            entitled: b.annualAfterOneYear.entitled,
            consumed: b.annualAfterOneYear.consumed,
            expired: b.annualAfterOneYear.expired,
          },
          tenureBonus: {
            available: b.tenureBonus.available,
            entitled: b.tenureBonus.entitled,
            consumed: b.tenureBonus.consumed,
            expired: b.tenureBonus.expired,
          },
          carryOver: {
            available: b.carryOver.available,
            entitled: b.carryOver.entitled,
            consumed: b.carryOver.consumed,
            expired: b.carryOver.expired,
          },
          totalUsed: pool.totalConsumed,
          totalExpired: pool.totalExpired,
          remaining: pool.available,
          compensationOwedDays: pool.compensationOwedDays,
          nextAccrualDate: pool.nextAccrualDate?.toISOString() ?? null,
          nextExpirationDate: pool.nextExpirationDate?.toISOString() ?? null,
        };
      })
    );

    return NextResponse.json({ year, rows });
  } catch (e) {
    console.error("[employee-leave-summary]", e);
    return NextResponse.json({ error: "목록을 불러올 수 없습니다." }, { status: 500 });
  }
}
