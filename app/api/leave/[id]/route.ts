import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { getAnnualLeaveEntitlement } from "@/lib/leave";

const leaveTypeDays: Record<string, number> = {
  ANNUAL: 1,
  HALF_AM: 0.5,
  HALF_PM: 0.5,
  QUARTER_AM: 0.25,
  QUARTER_PM: 0.25,
};

function isTeamLead(role: string | undefined) {
  return role === "TEAM_LEAD";
}
function isExecutive(role: string | undefined) {
  return role === "EXECUTIVE" || role === "ADMIN";
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const role = session.user.role;

    const { id } = await params;
    const body = await req.json();
    const requestedStatus = body.status as string;

    const leave = await prisma.leaveRequest.findUnique({ where: { id }, include: { user: true } });
    if (!leave) {
      return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });
    }

    // 팀장: 1차 승인/반려 (PENDING → TEAM_LEAD_APPROVED | REJECTED)
    if (isTeamLead(role)) {
      if (leave.status !== "PENDING") {
        return NextResponse.json({ error: "이미 처리된 신청이거나 2차 승인 대기 중입니다." }, { status: 400 });
      }
      if (requestedStatus !== "TEAM_LEAD_APPROVED" && requestedStatus !== "REJECTED") {
        return NextResponse.json({ error: "팀장은 1차 승인(TEAM_LEAD_APPROVED) 또는 반려(REJECTED)만 가능합니다." }, { status: 400 });
      }
      const updated = await prisma.leaveRequest.update({
        where: { id },
        data: { status: requestedStatus as "TEAM_LEAD_APPROVED" | "REJECTED" },
        include: { user: { select: { name: true, position: true } } },
      });
      return NextResponse.json(updated);
    }

    // 대표/임원: 2차 승인/반려 (TEAM_LEAD_APPROVED → APPROVED | REJECTED), 최종 승인 시에만 연차 차감
    if (isExecutive(role)) {
      if (leave.status !== "TEAM_LEAD_APPROVED") {
        return NextResponse.json({ error: "2차 승인은 팀장 1차 승인된 건만 처리할 수 있습니다." }, { status: 400 });
      }
      if (requestedStatus !== "APPROVED" && requestedStatus !== "REJECTED") {
        return NextResponse.json({ error: "status는 APPROVED 또는 REJECTED 여야 합니다." }, { status: 400 });
      }

      if (requestedStatus === "APPROVED") {
        const days = leave.type === "ANNUAL"
          ? Math.ceil((leave.endDate.getTime() - leave.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
          : (leaveTypeDays[leave.type] ?? 0);
        const year = leave.startDate.getFullYear();
        const entitlement = getAnnualLeaveEntitlement(leave.user.joinDate, year);
        await prisma.leaveBalance.upsert({
          where: { userId_year: { userId: leave.userId, year } },
          create: { userId: leave.userId, year, annualTotal: entitlement, annualUsed: days, manualDeduction: 0 },
          update: { annualUsed: { increment: days } },
        });
      }

      const updated = await prisma.leaveRequest.update({
        where: { id },
        data: { status: requestedStatus as "APPROVED" | "REJECTED" },
        include: { user: { select: { name: true, position: true } } },
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "처리에 실패했습니다." },
      { status: 500 }
    );
  }
}
