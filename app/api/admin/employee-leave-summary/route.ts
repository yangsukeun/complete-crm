import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getCurrentLeaveCalendarYearKst, completedFullMonthsSinceJoinKst } from "@/lib/leave";
import { calculateLeavePool } from "@/lib/leave/calculate-pool";
import { toKstYmd } from "@/lib/date-kst";
import { currentLeavePeriodYmd } from "@/lib/leave/leave-period";
import {
  canViewEmployeeLeaveSummary,
  isCsLeaveOverviewDepartment,
  leaveSummaryScope,
} from "@/lib/leave-overview-access";
import { normalizeDepartment } from "@/lib/work-log-access";

type Bd = {
  available: number;
  entitled: number;
  consumed: number;
  expired: number;
};

/**
 * 대표·관리자: 전부. CS 팀장·센터장: CS 소속만.
 */
export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, department: true },
    });
    const viewer = {
      role: me?.role ?? session.user.role,
      department: me?.department ?? session.user.department,
    };
    if (!canViewEmployeeLeaveSummary(viewer)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const scope = leaveSummaryScope(viewer);
    const year = getCurrentLeaveCalendarYearKst();
    const asOf = new Date();
    const asOfYmd = toKstYmd(asOf);
    const url = new URL(req.url);
    const deptQ = (url.searchParams.get("department") ?? "").trim();

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
        accountDisabled: true,
      },
    });

    const departments = [
      ...new Set(
        users
          .map((u) => normalizeDepartment(u.department))
          .filter((d) => d.length > 0)
      ),
    ].sort((a, b) => a.localeCompare(b, "ko"));

    const filtered = users.filter((u) => {
      if (scope === "cs") return isCsLeaveOverviewDepartment(u.department);
      if (!deptQ || deptQ === "__ALL__") return true;
      return normalizeDepartment(u.department) === normalizeDepartment(deptQ);
    });

    const rows = await Promise.all(
      filtered.map(async (u) => {
        const joinDate = u.joinDate instanceof Date ? u.joinDate : new Date(u.joinDate);
        const joinYmd = toKstYmd(joinDate);
        const fullMonths = joinYmd ? completedFullMonthsSinceJoinKst(joinYmd, asOfYmd) : 0;
        const tenureYears = Math.floor(fullMonths / 12);
        const tenureExtraMonths = fullMonths % 12;
        const period =
          joinYmd && asOfYmd ? currentLeavePeriodYmd(joinYmd, asOfYmd) : { start: "", end: "" };

        let pool;
        try {
          pool = await calculateLeavePool(u.id, asOf);
        } catch (perUser) {
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
          accountDisabled: u.accountDisabled,
          joinDate: joinDate.toISOString(),
          periodStart: period.start,
          periodEnd: period.end,
          year,
          tenureYears,
          tenureExtraMonths,
          monthlyUnderOneYear: bd(b.monthlyUnderOneYear),
          annualAfterOneYear: bd(b.annualAfterOneYear),
          tenureBonus: bd(b.tenureBonus),
          carryOver: bd(b.carryOver),
          priorCrmUsageDays: pool.priorCrmUsageDays,
          annualCarryOverDaysReported: pool.annualCarryOverDaysReported,
          totalGranted: pool.totalEntitled,
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

    const totalGranted = rows.reduce((s, r) => s + r.totalGranted, 0);
    const totalUsed = rows.reduce((s, r) => s + r.totalUsed, 0);
    const usageRate = totalGranted > 1e-6 ? (totalUsed / totalGranted) * 100 : 0;

    return NextResponse.json({
      year,
      scope,
      departments,
      defaultDepartment: scope === "cs" ? "CS팀" : "CS팀",
      lockedDepartment: scope === "cs" ? "CS팀" : null,
      stats: { totalGranted, totalUsed, usageRate },
      rows,
    });
  } catch (e) {
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
