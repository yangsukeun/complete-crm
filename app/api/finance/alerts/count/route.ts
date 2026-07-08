import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { loadTransferExecutorIds } from "@/lib/finance-payment-request-alerts";

/** 자금관리 뱃지: 팀장=승인대기(자금요청), 이체담당자=이체대기, 요청자=이체완료 알람 수 + 라벨 */
export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { count: 0, label: "알림" },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    const role = user?.role ?? session.user.role;

    // 대표/임원: 결제 요청 알람(이체 담당자·김소윤 건 승인 등) 미확인 수
    if (role === "EXECUTIVE" || role === "ADMIN") {
      let count = 0;
      try {
        count = await prisma.paymentRequestAlert.count({
          where: { userId: session.user.id, readAt: null },
        });
      } catch (err) {
        console.error("[GET /api/finance/alerts/count] executive paymentRequestAlert.count", err);
      }
      return NextResponse.json(
        { count, label: "승인대기" },
        {
          headers: {
            "Cache-Control": "private, max-age=0, must-revalidate, stale-while-revalidate=30",
          },
        }
      );
    }

    // 팀장: 같은 부서 승인대기 알람 수
    if (role === "TEAM_LEAD") {
      let alertCount = 0;
      try {
        alertCount = await prisma.paymentRequestAlert.count({
          where: { userId: session.user.id, readAt: null },
        });
      } catch (err) {
        console.error("[GET /api/finance/alerts/count] team lead paymentRequestAlert.count", err);
      }
      return NextResponse.json(
        { count: alertCount, label: "승인대기" },
        {
          headers: {
            "Cache-Control": "private, max-age=0, must-revalidate, stale-while-revalidate=30",
          },
        }
      );
    }

    // 이체 담당자 / 요청자: 미확인 알람 수
    let count = 0;
    try {
      count = await prisma.paymentRequestAlert.count({
        where: { userId: session.user.id, readAt: null },
      });
    } catch (err) {
      console.error("[GET /api/finance/alerts/count] paymentRequestAlert.count", err);
    }

    let transferExecutorIds: string[] = [];
    try {
      transferExecutorIds = await loadTransferExecutorIds();
    } catch (err) {
      console.error("[GET /api/finance/alerts/count] transferExecutorIds read failed", err);
      transferExecutorIds = [];
    }
    const isTransferExecutor = transferExecutorIds.includes(session.user.id);

    // 이체 담당자 → "이체대기", 그 외(요청자 등) → "이체완료" 뱃지
    const label = isTransferExecutor ? "이체대기" : "이체완료";

    return NextResponse.json(
      { count, label },
      {
        headers: {
          "Cache-Control": "private, max-age=0, must-revalidate, stale-while-revalidate=30",
        },
      }
    );
  } catch (e) {
    console.error("[GET /api/finance/alerts/count]", e);
    return NextResponse.json(
      { count: 0, label: "알림" },
      {
        headers: {
          "Cache-Control": "private, max-age=0, must-revalidate, stale-while-revalidate=15",
        },
      }
    );
  }
}
