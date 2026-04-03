import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

const VALID_STATUSES = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "IN_PROGRESS",
  "COMPLETED",
  "AWAITING_PAYMENT",
  "PAYMENT_COMPLETED",
] as const;

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return String(e);
  } catch {
    return "목록을 불러오는 중 오류가 발생했습니다.";
  }
}

export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");
    const where: { status?: (typeof VALID_STATUSES)[number] } =
      statusFilter && VALID_STATUSES.includes(statusFilter as (typeof VALID_STATUSES)[number])
        ? { status: statusFilter as (typeof VALID_STATUSES)[number] }
        : {};

    // [PERF-E] 목록 페이지네이션 (기본 50건)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

    const [total, list] = await Promise.all([
      prisma.quotation.count({ where }),
      prisma.quotation.findMany({
        where,
        orderBy: { issuedAt: "desc" },
        skip: offset,
        take: limit,
        include: {
          issuedBy: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
      }),
    ]);

    return NextResponse.json({
      items: list,
      total,
      hasMore: offset + list.length < total,
      offset,
      limit,
    });
  } catch (e) {
    console.error("[GET /api/quotations]", e);
    return NextResponse.json({ error: toErrorMessage(e).slice(0, 300) });
  }
}
