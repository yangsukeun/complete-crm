import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getCurrentLeaveCalendarYearKst } from "@/lib/leave";
import { calculateLeavePool } from "@/lib/leave/calculate-pool";
import { ensureLegacyCarryAccrual } from "@/lib/leave/legacy-carry-sync";
import { getEmployeeManagerContext } from "@/lib/employee-admin-access-db";

/**
 * GET: 관리자 전용 — 해당 직원의 연차 풀(근기법 정합)
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
    const manager = await getEmployeeManagerContext(session.user.id);
    if (!manager?.ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, joinDate: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const year = getCurrentLeaveCalendarYearKst();
    await ensureLegacyCarryAccrual(id);
    const pool = await calculateLeavePool(id, new Date());
    const balance = await prisma.leaveBalance.findUnique({
      where: { userId_year: { userId: id, year } },
      select: { annualUsed: true, manualDeduction: true, annualCarryOver: true },
    });
    const carryOver = balance?.annualCarryOver ?? 0;
    const annualUsed = balance?.annualUsed ?? 0;
    const manualDeduction = balance?.manualDeduction ?? 0;
    const annualTotal = pool.displayGranted;
    const leaveRemaining = pool.available;
    const totalAvailable = leaveRemaining + annualUsed + manualDeduction;

    return NextResponse.json({
      annualTotal,
      annualCarryOver: carryOver,
      totalAvailable,
      annualUsed,
      manualDeduction,
      leaveRemaining,
      pool,
    });
  } catch (e) {
    console.error("GET /api/users/[id]/leave-balance", e);
    return NextResponse.json(
      { error: "연차 정보를 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}
