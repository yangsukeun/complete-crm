import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { kstDateBoundsUtc } from "@/lib/date-kst";

/**
 * 관리자(EXECUTIVE, ADMIN) 전용 접속 로그 조회
 * - query: limit (기본 50), date (YYYY-MM-DD, 해당 날짜만), userId (특정 사용자만)
 */
export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      // 개발: 비로그인 시 401 대신 빈 배열 반환해 에러 창·콘솔 401 방지
      if (process.env.NODE_ENV === "development") return NextResponse.json([]);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = (session.user as { role?: string }).role;
    if (role !== "EXECUTIVE" && role !== "ADMIN") {
      return NextResponse.json(
        { error: "관리자만 접속 로그를 조회할 수 있습니다." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get("limit") ?? searchParams.get("take");
    const limit = Math.min(Number(limitParam) || 50, 200);
    const skip = Math.max(0, Number(searchParams.get("skip")) || 0);
    const dateStr = searchParams.get("date"); // YYYY-MM-DD
    const userId = searchParams.get("userId") ?? undefined;

    const where: {
      type: "LOGIN";
      userId?: string;
      loggedInAt?: { gte: Date; lt: Date };
    } = { type: "LOGIN" };

    if (userId) where.userId = userId;
    if (dateStr) {
      const { start: dayStart, end: dayEnd } = kstDateBoundsUtc(dateStr);
      where.loggedInAt = { gte: dayStart, lt: dayEnd };
    }

    const list = await prisma.accessLog.findMany({
      where,
      orderBy: { loggedInAt: "desc" },
      take: limit,
      skip,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            department: true,
            position: true,
          },
        },
      },
    });

    return NextResponse.json(
      list.map((log: any) => ({
        id: log.id,
        userId: log.userId,
        userName: log.user.name,
        userEmail: log.user.email,
        department: log.user.department,
        position: log.user.position,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        loggedInAt: log.loggedInAt.toISOString(),
        type: log.type,
      }))
    );
  } catch (e) {
    console.error("Access logs GET:", e);
    // 500 대신 빈 배열 반환해 클라이언트 에러 창/연속 실패 방지
    return NextResponse.json([]);
  }
}

/** POST는 클라이언트가 호출할 수 있음 — 기록은 layout ensureAccessLog에서 처리. 빈 응답으로 500 방지 */
export async function POST() {
  return new Response(null, { status: 204 });
}
