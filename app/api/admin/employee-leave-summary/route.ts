import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import {
  getAnnualLeaveEntitlement,
  getCurrentLeaveCalendarYearKst,
  resolveAnnualLeaveLaborRule,
} from "@/lib/leave";
import { syncLeaveBalanceAnnualTotalIfStale } from "@/lib/leave-balance-sync";

/**
 * 대표·시스템 관리자: 전 직원 당해연도 연차(부여·사용·잔여) 한눈에 조회.
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
    const companyRow = await prisma.companyInfo.findFirst({
      orderBy: { updatedAt: "desc" },
      select: {
        annualLeaveMonthlyMaxUnderOneYear: true,
        annualLeaveDaysAfterFirstFullYear: true,
      },
    });
    const laborRule = resolveAnnualLeaveLaborRule(companyRow);

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

    const balances = await prisma.leaveBalance.findMany({
      where: { year },
      select: {
        userId: true,
        annualTotal: true,
        annualCarryOver: true,
        annualUsed: true,
        manualDeduction: true,
      },
    });
    const balMap = new Map(balances.map((b) => [b.userId, b]));

    const rows = await Promise.all(
      users.map(async (u) => {
        const joinDate = u.joinDate instanceof Date ? u.joinDate : new Date(u.joinDate);
        const entitlement = getAnnualLeaveEntitlement(joinDate, year, new Date(), laborRule);
        const b = balMap.get(u.id) ?? null;
        await syncLeaveBalanceAnnualTotalIfStale(u.id, year, entitlement, b);
        const carryOver = b?.annualCarryOver ?? 0;
        const used = b?.annualUsed ?? 0;
        const manual = b?.manualDeduction ?? 0;
        const totalAvailable = entitlement + carryOver;
        const remaining = Math.max(0, totalAvailable - used - manual);
        return {
          userId: u.id,
          name: u.name,
          email: u.email,
          department: u.department,
          position: u.position,
          role: u.role,
          joinDate: joinDate.toISOString(),
          year,
          annualGranted: entitlement,
          annualCarryOver: carryOver,
          annualUsed: used,
          manualDeduction: manual,
          totalAvailable,
          remaining,
        };
      })
    );

    return NextResponse.json({ year, rows });
  } catch (e) {
    console.error("[employee-leave-summary]", e);
    return NextResponse.json({ error: "목록을 불러올 수 없습니다." }, { status: 500 });
  }
}
