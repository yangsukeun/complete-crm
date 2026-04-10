import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { extractTaskStatusMarkers, getOrCreateDailyWorkLog, stripTaskStatusMarkers } from "@/lib/activity-log";
import { createNotificationWithOptions } from "@/lib/notifications";
import { userHasPermission } from "@/lib/permissions";
import { assertCanViewOthersDailyWorkLog } from "@/lib/work-log-access";
import { todayYmdKst } from "@/lib/date-kst";

/**
 * GET: 오늘(또는 date 파라미터)의 업무일지 조회. 없으면 ActivityLog 기반으로 자동 생성 후 반환.
 * - date: YYYY-MM-DD (기본: 오늘)
 * - userId: 관리자만 지정 가능, 지정 시 해당 직원 일지
 */
export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date") ?? todayYmdKst();
    const targetUserId = searchParams.get("userId") ?? null;

    const isExecutive = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    const canViewOthersLogs =
      isExecutive ||
      userHasPermission(session.user as { role: string; permissions?: string | null }, "admin_logs");
    /** 타인 일지: 임원/관리자 또는 admin_logs 권한(팀장 기본 포함) */
    const userId = targetUserId && canViewOthersLogs ? targetUserId : session.user.id;

    if (targetUserId && !canViewOthersLogs) {
      return NextResponse.json({ error: "다른 직원의 Daily Report는 조회할 수 없습니다." }, { status: 403 });
    }

    if (targetUserId && canViewOthersLogs && targetUserId !== session.user.id) {
      const viewer = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { department: true, role: true },
      });
      const gate = await assertCanViewOthersDailyWorkLog({
        viewerId: session.user.id,
        viewerRole: String(viewer?.role ?? session.user.role ?? "USER"),
        viewerDepartment: viewer?.department,
        targetUserId,
      });
      if (!gate.ok) {
        return NextResponse.json({ error: gate.error }, { status: gate.status });
      }
    }

    const log = await getOrCreateDailyWorkLog(userId, dateStr);
    return NextResponse.json({
      ...log,
      // 내부 중복 방지 마커는 UI에 노출하지 않음
      content: stripTaskStatusMarkers(log.content ?? ""),
      monthDeadlines: log.monthDeadlines ?? [],
    });
  } catch (e) {
    console.error("Work logs GET:", e);
    return NextResponse.json(
      { error: "Daily Report를 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

/**
 * PATCH: 현재 사용자의 해당 날짜 업무일지 내용/상태 수정
 * - date: YYYY-MM-DD
 * - content?: string
 * - status?: "DRAFT" | "SUBMITTED"
 */
export async function PATCH(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const dateStr = body.date ?? todayYmdKst();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ error: "날짜 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const existing = await prisma.dailyWorkLog.findUnique({
      where: { userId_date: { userId: session.user.id, date: dateStr } },
    });

    if (!existing) {
      return NextResponse.json({ error: "해당 날짜의 일지가 없습니다. 먼저 조회해 생성하세요." }, { status: 404 });
    }

    const data: { content?: string; status?: "DRAFT" | "SUBMITTED" } = {};
    if (typeof body.content === "string") {
      // 사용자가 저장하는 content에는 내부 마커를 포함시키지 않고,
      // 기존 마커는 DB에서 추출해 뒤에 다시 붙여 중복 방지 상태를 유지한다.
      const preservedMarkers = extractTaskStatusMarkers(existing.content ?? "");
      const cleaned = stripTaskStatusMarkers(body.content ?? "").trimEnd();
      data.content = preservedMarkers ? `${cleaned}\n\n${preservedMarkers}` : cleaned;
    }
    const becameSubmitted =
      body.status === "SUBMITTED" && existing.status !== "SUBMITTED";
    if (body.status === "DRAFT" || body.status === "SUBMITTED") data.status = body.status;

    const updated = await prisma.dailyWorkLog.update({
      where: { id: existing.id },
      data,
    });

    if (becameSubmitted) {
      const submitter = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true },
      });
      const name = submitter?.name?.trim() || "직원";
      const link = `/admin/logs?userId=${encodeURIComponent(session.user.id)}&date=${encodeURIComponent(dateStr)}`;
      const admins = await prisma.user.findMany({
        where: { role: { in: ["EXECUTIVE", "ADMIN"] } },
        select: { id: true },
      });
      await Promise.all(
        admins.map((a) =>
          createNotificationWithOptions({
            userId: a.id,
            type: "WORK_LOG_SUBMITTED",
            message: `${name}님이 Daily Report를 제출했습니다`,
            link,
            actorId: session.user.id,
            priority: "high",
          })
        )
      );
    }

    return NextResponse.json({
      id: updated.id,
      date: updated.date,
      content: updated.content,
      status: updated.status,
    });
  } catch (e) {
    console.error("Work logs PATCH:", e);
    return NextResponse.json(
      { error: "Daily Report 수정에 실패했습니다." },
      { status: 500 }
    );
  }
}
