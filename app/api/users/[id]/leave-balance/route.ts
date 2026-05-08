import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import {
  getAnnualLeaveEntitlement,
  getCurrentLeaveCalendarYearKst,
  resolveAnnualLeaveLaborRule,
} from "@/lib/leave";

/**
 * GET: 관리자 전용 — 해당 직원의 당해 연도 연차 정보 (직원 수정 시 휴가 소진 필드 표시용)
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const role = String(session.user.role ?? "").toUpperCase();
    if (role !== "EXECUTIVE" && role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const [user, companyRow] = await Promise.all([
      prisma.user.findUnique({
        where: { id },
        select: { id: true, joinDate: true },
      }),
      prisma.companyInfo.findFirst({
        orderBy: { updatedAt: "desc" },
        select: {
          annualLeaveMonthlyMaxUnderOneYear: true,
          annualLeaveDaysAfterFirstFullYear: true,
        },
      }),
    ]);
    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const year = getCurrentLeaveCalendarYearKst();
    const laborRule = resolveAnnualLeaveLaborRule(companyRow);
    const joinDate = user.joinDate instanceof Date ? user.joinDate : new Date(user.joinDate);
    const annualTotal = getAnnualLeaveEntitlement(joinDate, year, new Date(), laborRule);
    const balance = await prisma.leaveBalance.findUnique({
      where: { userId_year: { userId: id, year } },
      select: { annualUsed: true, manualDeduction: true, annualCarryOver: true },
    });
    const carryOver = balance?.annualCarryOver ?? 0;
    const annualUsed = balance?.annualUsed ?? 0;
    const manualDeduction = balance?.manualDeduction ?? 0;
    const totalAvailable = annualTotal + carryOver;
    const leaveRemaining = Math.max(0, totalAvailable - annualUsed - manualDeduction);

    return NextResponse.json({
      annualTotal,
      annualCarryOver: carryOver,
      totalAvailable,
      annualUsed,
      manualDeduction,
      leaveRemaining,
    });
  } catch (e) {
    console.error("GET /api/users/[id]/leave-balance", e);
    return NextResponse.json(
      { error: "연차 정보를 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}
