import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

function getTransferExecutorIds(idsJson: string | null): string[] {
  if (!idsJson?.trim()) return [];
  try {
    const arr = JSON.parse(idsJson) as unknown;
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

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

    // 팀장: 승인대기(자금요청) 건수 → "승인대기" 뱃지
    if (role === "TEAM_LEAD") {
      const count = await prisma.paymentRequest.count({
        where: { status: "PENDING" },
      });
      return NextResponse.json(
        { count, label: "승인대기" },
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

    const company = await prisma.companyInfo.findFirst({ orderBy: { updatedAt: "desc" } });
    const transferExecutorIds = getTransferExecutorIds(
      company?.transferExecutorIds ?? (company as { transferExecutorIds?: string | null })?.transferExecutorIds ?? null
    );
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
