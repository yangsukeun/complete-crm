import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { getDashboardSalesStats } from "@/lib/dashboard-sales";

export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await getDashboardSalesStats();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (e) {
    console.error("[GET /api/dashboard/sales-stats]", e);
    return NextResponse.json({ error: "통계를 불러올 수 없습니다." }, { status: 500 });
  }
}
