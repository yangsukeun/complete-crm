import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

/** 자금관리 뱃지: 팀장=승인대기 건수, 이체담당자/요청자=미확인 알람 수 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ count: 0 }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }
    let role: string | undefined = session.user.role as string | undefined;
    try {
      const roleRows = await prisma.$queryRawUnsafe<{ role: string }[]>(
        "SELECT role FROM User WHERE id = ?",
        session.user.id
      );
      if (roleRows[0]) role = roleRows[0].role;
    } catch (_) {}

    if (role === "TEAM_LEAD") {
      const pendingRows = await prisma.$queryRawUnsafe<{ count: number }[]>(
        "SELECT COUNT(*) as count FROM PaymentRequest WHERE status = ?",
        "PENDING"
      );
      const count = Number(pendingRows[0]?.count ?? 0);
      return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    const rows = await prisma.$queryRawUnsafe<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM PaymentRequestAlert WHERE userId = ? AND readAt IS NULL",
      session.user.id
    );
    const count = Number(rows[0]?.count ?? 0);
    return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ count: 0 }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
