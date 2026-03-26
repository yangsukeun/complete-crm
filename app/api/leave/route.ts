import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { getAnnualLeaveEntitlement } from "@/lib/leave";
import { sendPushToUsers } from "@/lib/notifications/push";

const leaveTypeDays: Record<string, number> = {
  ANNUAL: 1,
  HALF_AM: 0.5,
  HALF_PM: 0.5,
  QUARTER_AM: 0.25,
  QUARTER_PM: 0.25,
};

const createSchema = z.object({
  type: z.enum(["ANNUAL", "HALF_AM", "HALF_PM", "QUARTER_AM", "QUARTER_PM"]),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().optional(),
});

export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = session.user.role;
    const isManager = role === "TEAM_LEAD" || role === "EXECUTIVE" || role === "ADMIN"; // 팀장/대표: 전체 목록

    const requests = await prisma.leaveRequest.findMany({
      where: isManager ? {} : { userId: session.user.id },
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

    const year = new Date().getFullYear();
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { joinDate: true },
    });
    const joinDate = user?.joinDate ?? new Date();
    const annualTotal = getAnnualLeaveEntitlement(joinDate, year);

    let balance = await prisma.leaveBalance.findUnique({
      where: { userId_year: { userId: session.user.id, year } },
    });
    if (!balance) {
      balance = await prisma.leaveBalance.create({
        data: { userId: session.user.id, year, annualTotal, annualUsed: 0, manualDeduction: 0 },
      });
    }
    const carryOver = balance.annualCarryOver ?? 0;
    const manualDeduction = balance.manualDeduction ?? 0;
    const totalAvailable = annualTotal + carryOver;
    const remaining = Math.max(0, totalAvailable - balance.annualUsed - manualDeduction);

    return NextResponse.json({
      requests,
      balance: {
        year,
        total: totalAvailable,
        annualTotal,
        carryOver,
        used: balance.annualUsed,
        manualDeduction,
        remaining,
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

    const year = new Date().getFullYear();
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { joinDate: true },
    });
    const joinDate = user?.joinDate ?? new Date();
    const annualTotal = getAnnualLeaveEntitlement(joinDate, year);

    let balance = await prisma.leaveBalance.findUnique({
      where: { userId_year: { userId: session.user.id, year } },
    });
    if (!balance) {
      balance = await prisma.leaveBalance.create({
        data: { userId: session.user.id, year, annualTotal, annualUsed: 0, manualDeduction: 0 },
      });
    }
    const carryOver = balance.annualCarryOver ?? 0;
    const manualDeduction = balance.manualDeduction ?? 0;
    const totalAvailable = annualTotal + carryOver;
    const remaining = totalAvailable - balance.annualUsed - manualDeduction;

    let days = 0;
    const type = parsed.data.type;
    if (type === "ANNUAL") {
      const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      days = Math.min(diff, 30);
    } else {
      days = leaveTypeDays[type] ?? 0;
    }

    if (days > remaining) {
      return NextResponse.json(
        { error: `연차 잔여일(${remaining.toFixed(1)}일)이 부족합니다.` },
        { status: 400 }
      );
    }

    const leave = await prisma.leaveRequest.create({
      data: {
        userId: session.user.id,
        type: parsed.data.type as "ANNUAL" | "HALF_AM" | "HALF_PM" | "QUARTER_AM" | "QUARTER_PM",
        startDate: start,
        endDate: end,
        reason: parsed.data.reason ?? null,
      },
      include: { user: { select: { name: true, position: true } } },
    });

    const execRecipients = await prisma.user.findMany({
      where: { role: { in: ["EXECUTIVE", "ADMIN"] } },
      select: { id: true },
    });
    const execIds = execRecipients.map((u) => u.id).filter(Boolean);
    if (execIds.length > 0) {
      const applicant = leave.user?.name ?? "직원";
      const msg = `${applicant}님이 휴가를 신청했습니다.`;
      void sendPushToUsers({
        userIds: execIds,
        title: "휴가 신청",
        message: msg,
        headings: { ko: "휴가 신청", en: "Leave request" },
        contents: { ko: msg, en: msg },
        url: "/leave",
        data: { type: "leave_request", leaveId: leave.id },
        priority: "high",
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
