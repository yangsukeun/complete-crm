import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { calculateLeavePool } from "@/lib/leave/calculate-pool";
import {
  applyApprovedLeaveConsumption,
  reverseApprovedLeaveConsumption,
} from "@/lib/leave/apply-approved-consumption";
import { createNotificationWithOptions } from "@/lib/notifications";

const leaveTypeDays: Record<string, number> = {
  ANNUAL: 1,
  HALF_AM: 0.5,
  HALF_PM: 0.5,
  QUARTER_AM: 0.25,
  QUARTER_PM: 0.25,
};

function isSickLeaveType(t: string): boolean {
  return t === "SICK_PAID" || t === "SICK_UNPAID";
}

function isTeamLead(role: string | undefined) {
  return role === "TEAM_LEAD";
}
function isExecutive(role: string | undefined) {
  return role === "EXECUTIVE" || role === "ADMIN";
}

function canOwnerRequestCancel(current: string) {
  return current === "PENDING" || current === "TEAM_LEAD_APPROVED" || current === "APPROVED";
}

function canManagerFinalizeCancel(cancelFromStatus: string | null | undefined, role: string | undefined) {
  if (!cancelFromStatus) return false;
  // 1차 대기(PENDING) 취소는 팀장/임원 모두 처리 가능
  if (cancelFromStatus === "PENDING") return isTeamLead(role) || isExecutive(role);
  // 2차 대기/최종승인 취소는 임원(또는 ADMIN)이 최종 처리
  if (cancelFromStatus === "TEAM_LEAD_APPROVED" || cancelFromStatus === "APPROVED") return isExecutive(role);
  return false;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
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

    // 본인: 취소 요청 (PENDING|TEAM_LEAD_APPROVED|APPROVED → CANCEL_REQUESTED)
    if (leave.userId === session.user.id) {
      if (requestedStatus === "CANCEL_REQUESTED") {
        if (leave.status === "CANCEL_REQUESTED" || leave.status === "CANCELLED") {
          return NextResponse.json({ error: "이미 취소 요청/취소 처리된 신청입니다." }, { status: 400 });
        }
        if (!canOwnerRequestCancel(leave.status)) {
          return NextResponse.json({ error: "취소 요청할 수 없는 상태입니다." }, { status: 400 });
        }

        const updated = await prisma.leaveRequest.update({
          where: { id },
          data: { status: "CANCEL_REQUESTED", cancelFromStatus: leave.status },
          include: { user: { select: { name: true, position: true } } },
        });

        const applicant = updated.user?.name ?? "직원";
        const managers = await prisma.user.findMany({
          where: {
            role: { in: ["TEAM_LEAD", "EXECUTIVE", "ADMIN"] },
            id: { not: leave.userId },
          },
          select: { id: true, role: true },
        });
        for (const m of managers) {
          const msg =
            leave.status === "PENDING"
              ? `${applicant}님이 휴가 신청을 취소 요청했습니다. 연차/근태에서 취소 처리해 주세요.`
              : `${applicant}님이 휴가(승인 단계)를 취소 요청했습니다. 연차/근태에서 취소 처리해 주세요.`;
          await createNotificationWithOptions({
            userId: m.id,
            type: "LEAVE_REQUEST",
            message: msg,
            link: "/leave",
            actorId: leave.userId,
          });
        }

        return NextResponse.json(updated);
      }
      // 소유자는 승인/반려 상태 변경 불가(취소 요청만)
      if (requestedStatus === "TEAM_LEAD_APPROVED" || requestedStatus === "APPROVED" || requestedStatus === "REJECTED" || requestedStatus === "CANCELLED") {
        return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
      }
    }

    // 팀장: 1차 승인/반려 (PENDING → TEAM_LEAD_APPROVED | REJECTED)
    if (isTeamLead(role)) {
      // 취소 요청 처리: cancelFromStatus 기준으로 가능 여부 결정
      if (leave.status === "CANCEL_REQUESTED") {
        if (requestedStatus !== "CANCELLED") {
          return NextResponse.json({ error: "취소 요청 건은 취소 처리(CANCELLED)만 가능합니다." }, { status: 400 });
        }
        if (!canManagerFinalizeCancel(leave.cancelFromStatus, role)) {
          return NextResponse.json({ error: "취소 처리 권한이 없습니다." }, { status: 403 });
        }
        const updated = await prisma.leaveRequest.update({
          where: { id },
          data: { status: "CANCELLED" },
          include: { user: { select: { name: true, position: true } } },
        });
        return NextResponse.json(updated);
      }

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

      if (requestedStatus === "TEAM_LEAD_APPROVED") {
        const name = updated.user?.name ?? "직원";
        const execs = await prisma.user.findMany({
          where: { role: { in: ["EXECUTIVE", "ADMIN"] } },
          select: { id: true },
        });
        for (const u of execs) {
          await createNotificationWithOptions({
            userId: u.id,
            type: "LEAVE_REQUEST",
            message: `${name}님 휴가 신청이 팀장 1차 승인되었습니다. 연차/근태에서 최종 승인해 주세요.`,
            link: "/leave",
            actorId: leave.userId,
          });
        }
      }

      return NextResponse.json(updated);
    }

    // 대표/임원: 2차 승인/반려 (TEAM_LEAD_APPROVED → APPROVED | REJECTED), 최종 승인 시에만 연차 차감
    if (isExecutive(role)) {
      // 취소 요청 처리 (CANCEL_REQUESTED → CANCELLED). APPROVED 취소면 연차 사용 복구
      if (leave.status === "CANCEL_REQUESTED") {
        if (requestedStatus !== "CANCELLED") {
          return NextResponse.json({ error: "취소 요청 건은 취소 처리(CANCELLED)만 가능합니다." }, { status: 400 });
        }
        if (!canManagerFinalizeCancel(leave.cancelFromStatus, role)) {
          return NextResponse.json({ error: "취소 처리 권한이 없습니다." }, { status: 403 });
        }

        if (leave.cancelFromStatus === "APPROVED" && !isSickLeaveType(leave.type)) {
          await prisma.$transaction(async (tx) => {
            await reverseApprovedLeaveConsumption(tx, id);
          });
        }

        const updated = await prisma.leaveRequest.update({
          where: { id },
          data: { status: "CANCELLED" },
          include: { user: { select: { name: true, position: true } } },
        });
        return NextResponse.json(updated);
      }

      if (leave.status !== "TEAM_LEAD_APPROVED") {
        return NextResponse.json({ error: "2차 승인은 팀장 1차 승인된 건만 처리할 수 있습니다." }, { status: 400 });
      }
      if (requestedStatus !== "APPROVED" && requestedStatus !== "REJECTED") {
        return NextResponse.json({ error: "status는 APPROVED 또는 REJECTED 여야 합니다." }, { status: 400 });
      }

      if (requestedStatus === "APPROVED" && !isSickLeaveType(leave.type)) {
        const days =
          leave.type === "ANNUAL"
            ? Math.ceil((leave.endDate.getTime() - leave.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
            : (leaveTypeDays[leave.type] ?? 0);

        const pool = await calculateLeavePool(leave.userId, new Date());
        if (days > pool.available + 1e-6) {
          return NextResponse.json(
            { error: `연차 잔여일(${pool.available.toFixed(1)}일)이 부족합니다.` },
            { status: 400 }
          );
        }

        try {
          await prisma.$transaction(async (tx) => {
            await applyApprovedLeaveConsumption(tx, leave.userId, id, days, new Date());
            await tx.leaveRequest.update({
              where: { id },
              data: { status: "APPROVED" },
            });
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("LEAVE_POOL_INSUFFICIENT")) {
            return NextResponse.json({ error: "연차 잔여가 부족합니다." }, { status: 400 });
          }
          throw err;
        }

        const updated = await prisma.leaveRequest.findUnique({
          where: { id },
          include: { user: { select: { name: true, position: true } } },
        });
        return NextResponse.json(updated);
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
