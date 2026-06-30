import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { createNotificationWithOptions } from "@/lib/notifications";
import { teamLeadNotifyWhereForApplicantDepartment, fetchDepartmentsWithTeamLead, needsExecutiveDirectLeaveApproval } from "@/lib/leave-department-access";
import {
  leaveRequestListWhere,
  serializeLeaveRequestForViewer,
  type LeaveRequestWithUser,
} from "@/lib/leave-request-serialize";
import { calculateLeavePool } from "@/lib/leave/calculate-pool";
import { getCurrentLeaveCalendarYearKst } from "@/lib/leave";

const leaveTypeDays: Record<string, number> = {
  ANNUAL: 1,
  HALF_AM: 0.5,
  HALF_PM: 0.5,
  QUARTER_AM: 0.25,
  QUARTER_PM: 0.25,
};

const createSchema = z.object({
  type: z.enum([
    "ANNUAL",
    "HALF_AM",
    "HALF_PM",
    "QUARTER_AM",
    "QUARTER_PM",
    "SICK_PAID",
    "SICK_UNPAID",
  ]),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().optional(),
});

function isSickLeaveType(t: string): boolean {
  return t === "SICK_PAID" || t === "SICK_UNPAID";
}

export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = String(session.user.role ?? "").toUpperCase();
    const uid = session.user.id;
    const year = getCurrentLeaveCalendarYearKst();

    const viewer = await prisma.user.findUnique({
      where: { id: uid },
      select: { department: true },
    });

    const rawRequests = await prisma.leaveRequest.findMany({
      where: leaveRequestListWhere(uid, role, viewer?.department),
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            department: true,
            position: true,
            currentProject: { select: { name: true, brand: { select: { name: true } } } },
          },
        },
      },
      orderBy: { startDate: "desc" },
    });

    const pool = await calculateLeavePool(uid, new Date());

    let balanceRow: { annualUsed: number; manualDeduction: number; annualCarryOver: number } | null = null;
    try {
      balanceRow = await prisma.leaveBalance.findUnique({
        where: { userId_year: { userId: uid, year } },
        select: { annualUsed: true, manualDeduction: true, annualCarryOver: true },
      });
    } catch {
      balanceRow = null;
    }
    const used = balanceRow?.annualUsed ?? 0;
    const manualDeduction = balanceRow?.manualDeduction ?? 0;
    const carryOver = balanceRow?.annualCarryOver ?? 0;
    const remaining = pool.available;
    const total = remaining + used + manualDeduction;

    const requests = (rawRequests as LeaveRequestWithUser[]).map((row) =>
      serializeLeaveRequestForViewer(row, uid, role)
    );

    const departmentsWithTeamLead = [
      ...((await fetchDepartmentsWithTeamLead(prisma)).values()),
    ];

    return NextResponse.json({
      requests,
      viewer: { department: viewer?.department ?? null },
      departmentsWithTeamLead,
      balance: {
        year,
        total,
        annualTotal: pool.totalEntitled,
        carryOver,
        used,
        manualDeduction,
        remaining,
        available: pool.available,
        compensationOwedDays: pool.compensationOwedDays,
        breakdown: pool.breakdown,
        totalEntitled: pool.totalEntitled,
        totalConsumed: pool.totalConsumed,
        totalExpired: pool.totalExpired,
        nextAccrualDate: pool.nextAccrualDate,
        nextExpirationDate: pool.nextExpirationDate,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "연차/근태 정보를 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const start = new Date(parsed.data.startDate);
    const end = new Date(parsed.data.endDate);
    if (end < start) {
      return NextResponse.json(
        { error: "종료일은 시작일 이후여야 합니다." },
        { status: 400 }
      );
    }

    let days = 0;
    const type = parsed.data.type;
    if (type === "ANNUAL" || isSickLeaveType(type)) {
      const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      days = Math.min(diff, isSickLeaveType(type) ? 365 : 30);
    } else {
      days = leaveTypeDays[type] ?? 0;
    }

    if (!isSickLeaveType(type)) {
      const pool = await calculateLeavePool(session.user.id, new Date());
      if (days > pool.available + 1e-6) {
        return NextResponse.json(
          { error: `연차 잔여일(${pool.available.toFixed(1)}일)이 부족합니다.` },
          { status: 400 }
        );
      }
    }

    const leave = await prisma.leaveRequest.create({
      data: {
        userId: session.user.id,
        type: parsed.data.type,
        startDate: start,
        endDate: end,
        reason: parsed.data.reason ?? null,
      },
      include: {
        user: { select: { name: true, position: true, department: true } },
      },
    });

    const applicantId = session.user.id;
    const applicantName = leave.user?.name ?? "직원";
    const departmentsWithTeamLead = await fetchDepartmentsWithTeamLead(prisma);
    const executiveDirect = needsExecutiveDirectLeaveApproval(
      leave.user?.department,
      departmentsWithTeamLead
    );
    const teamLeadFilter = teamLeadNotifyWhereForApplicantDepartment(leave.user?.department);
    const managers = await prisma.user.findMany({
      where: {
        OR: [
          { role: { in: ["EXECUTIVE", "ADMIN"] } },
          ...(teamLeadFilter ? [teamLeadFilter] : []),
        ],
        id: { not: applicantId },
      },
      select: { id: true, role: true },
    });

    for (const r of managers) {
      const isTeamLeadRole = r.role === "TEAM_LEAD";
      const message = isTeamLeadRole
        ? `${applicantName}님이 휴가를 신청했습니다. 아래 목록에서 1차 승인해 주세요.`
        : executiveDirect
          ? `${applicantName}님이 휴가를 신청했습니다. 해당 부서에 팀장이 없어 연차/근태(/leave)에서 바로 최종 승인해 주세요.`
          : `${applicantName}님이 휴가를 신청했습니다. 팀장 1차 승인 후 최종 승인할 수 있습니다. 연차/근태(/leave)에서 확인하세요.`;
      await createNotificationWithOptions({
        userId: r.id,
        type: "LEAVE_REQUEST",
        message,
        link: "/leave",
        actorId: applicantId,
      });
    }

    return NextResponse.json(leave);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "휴가 신청에 실패했습니다." },
      { status: 500 }
    );
  }
}
