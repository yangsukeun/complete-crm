import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { applyManualLeaveAdjustment } from "@/lib/leave/apply-manual-adjustment";
import { canAdjustEmployeeLeave } from "@/lib/leave-overview-access";

export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canAdjustEmployeeLeave(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId } = await params;
    const body = (await req.json().catch(() => ({}))) as { days?: unknown; reason?: unknown };
    const days = typeof body.days === "number" ? body.days : Number(body.days);
    const reason = typeof body.reason === "string" ? body.reason : "";

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json({ error: "직원을 찾을 수 없습니다." }, { status: 404 });
    }

    try {
      const row = await prisma.$transaction((tx) =>
        applyManualLeaveAdjustment(tx, {
          userId,
          actorId: session.user.id,
          days,
          reason,
        })
      );
      return NextResponse.json({ ok: true, id: row.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "LEAVE_ADJUST_REASON_REQUIRED") {
        return NextResponse.json({ error: "사유를 입력하세요." }, { status: 400 });
      }
      if (msg === "LEAVE_ADJUST_DAYS_INVALID") {
        return NextResponse.json({ error: "조정 일수는 0이 아닌 숫자여야 합니다." }, { status: 400 });
      }
      if (msg === "LEAVE_ADJUST_DAYS_RANGE") {
        return NextResponse.json({ error: "조정 일수는 ±365일 이내여야 합니다." }, { status: 400 });
      }
      if (msg.includes("LEAVE_POOL_INSUFFICIENT")) {
        return NextResponse.json({ error: "잔여 연차가 부족해 차감할 수 없습니다." }, { status: 400 });
      }
      throw err;
    }
  } catch (e) {
    console.error("[leave-adjust]", e);
    return NextResponse.json({ error: "조정에 실패했습니다." }, { status: 500 });
  }
}
