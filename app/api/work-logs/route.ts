import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { getOrCreateDailyWorkLog } from "@/lib/activity-log";
import { format } from "date-fns";

/**
 * GET: 오늘(또는 date 파라미터)의 업무일지 조회. 없으면 ActivityLog 기반으로 자동 생성 후 반환.
 * - date: YYYY-MM-DD (기본: 오늘)
 * - userId: 관리자만 지정 가능, 지정 시 해당 직원 일지
 */
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date") ?? format(new Date(), "yyyy-MM-dd");
    const targetUserId = searchParams.get("userId") ?? null;

    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    const userId = targetUserId && isAdmin ? targetUserId : session.user.id;

    if (targetUserId && !isAdmin) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const log = await getOrCreateDailyWorkLog(userId, dateStr);
    return NextResponse.json(log);
  } catch (e) {
    console.error("Work logs GET:", e);
    return NextResponse.json(
      { error: "업무일지를 불러올 수 없습니다." },
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const dateStr = body.date ?? format(new Date(), "yyyy-MM-dd");
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
    if (typeof body.content === "string") data.content = body.content;
    if (body.status === "DRAFT" || body.status === "SUBMITTED") data.status = body.status;

    const updated = await prisma.dailyWorkLog.update({
      where: { id: existing.id },
      data,
    });

    return NextResponse.json({
      id: updated.id,
      date: updated.date,
      content: updated.content,
      status: updated.status,
    });
  } catch (e) {
    console.error("Work logs PATCH:", e);
    return NextResponse.json(
      { error: "업무일지 수정에 실패했습니다." },
      { status: 500 }
    );
  }
}
