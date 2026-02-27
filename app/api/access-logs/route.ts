import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

/**
 * 관리자(EXECUTIVE, ADMIN) 전용 접속 로그 조회
 * - query: limit (기본 50), date (YYYY-MM-DD, 해당 날짜만), userId (특정 사용자만)
 */
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
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
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);
    const dateStr = searchParams.get("date"); // YYYY-MM-DD
    const userId = searchParams.get("userId") ?? undefined;

    const where: {
      type: "LOGIN";
      userId?: string;
      loggedInAt?: { gte: Date; lt: Date };
    } = { type: "LOGIN" };

    if (userId) where.userId = userId;
    if (dateStr) {
      const dayStart = new Date(dateStr + "T00:00:00");
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      where.loggedInAt = { gte: dayStart, lt: dayEnd };
    }

    const list = await prisma.accessLog.findMany({
      where,
      orderBy: { loggedInAt: "desc" },
      take: limit,
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
    return NextResponse.json(
      { error: "접속 로그를 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}
