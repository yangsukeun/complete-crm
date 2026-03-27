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
    const list = await prisma.quotation.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      include: {
        issuedBy: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(list);
  } catch (e) {
    console.error("[GET /api/quotations]", e);
    return NextResponse.json({ error: toErrorMessage(e).slice(0, 300) });
  }
}
