import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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
    return "처리 중 오류가 발생했습니다.";
  }
}

/** 본문 수정: 항상 200 + { ok: true } 또는 { error: string } 반환 (500 없음) */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." });
    }
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "견적서 ID가 없습니다." });
    }
    const body = await req.json().catch(() => ({}));
    const existing = await prisma.quotation.findUnique({ where: { id }, include: { items: true } });
    if (!existing) {
      return NextResponse.json({ error: "견적서를 찾을 수 없습니다." });
    }
    if (existing.issuedById !== session.user.id) {
      return NextResponse.json({ error: "견적서 발행자만 수정할 수 있습니다." });
    }

    const updateData: Parameters<typeof prisma.quotation.update>[0]["data"] = {};
    if (body.title !== undefined) updateData.title = String(body.title).trim() || existing.title;
    if (body.clientName !== undefined) updateData.clientName = String(body.clientName).trim() || existing.clientName;
    if (body.validUntil !== undefined) {
      const d = new Date(body.validUntil);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "유효기간 날짜 형식이 올바르지 않습니다." });
      }
      updateData.validUntil = d;
    }
    if (body.remarks !== undefined) updateData.remarks = body.remarks === "" || body.remarks == null ? null : String(body.remarks);

    const items = Array.isArray(body.items) ? body.items : undefined;
    const finalAmountOverrideRaw = body.finalAmountOverride;
    if (items && items.length > 0) {
      const totalAmount = items.reduce((sum: number, i: { amount?: number }) => sum + (Number(i?.amount) || 0), 0);
      const vatAmount = Math.floor(totalAmount * 0.1);
      const finalAmount = totalAmount + vatAmount;
      updateData.totalAmount = totalAmount;
      updateData.vatAmount = vatAmount;
      updateData.finalAmount = finalAmount;
    }
    if (finalAmountOverrideRaw !== undefined && finalAmountOverrideRaw !== null) {
      const n = Number(finalAmountOverrideRaw);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: "총합계(부가세 포함) 금액이 올바르지 않습니다." });
      }
      const final = Math.max(0, Math.floor(n));
      const total = Math.max(0, Math.round(final / 1.1)); // 원 단위 반올림(공급가)
      const vat = Math.max(0, final - total);
      updateData.totalAmount = total;
      updateData.vatAmount = vat;
      updateData.finalAmount = final;
    }
    if (Object.keys(updateData).length === 0 && (!items || items.length === 0)) {
      return NextResponse.json({ error: "수정할 내용이 없습니다." });
    }
    if (Object.keys(updateData).length === 0) {
      updateData.remarks = existing.remarks ?? null;
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.quotation.update({ where: { id }, data: updateData });
      if (items !== undefined) {
        await tx.quotationItem.deleteMany({ where: { quotationId: id } });
        await tx.quotationItem.createMany({
          data: items.map((item: any, idx: any) => ({
            quotationId: id,
            description: String(item?.description ?? "").trim() || "(품목)",
            quantity: Number(item?.quantity) || 0,
            unitPrice: Number(item?.unitPrice) || 0,
            amount: Number(item?.amount) || 0,
            sortOrder: idx,
          })),
        });
      }
    });
    revalidatePath("/quotations");
    revalidatePath(`/quotations/${id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[PUT /api/quotations/[id]]", e);
    return NextResponse.json({ error: toErrorMessage(e).slice(0, 300) });
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: {
        issuedBy: { select: { id: true, name: true } },
        items: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!quotation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(quotation);
  } catch (e) {
    console.error("[GET /api/quotations/[id]]", e);
    return NextResponse.json({ error: toErrorMessage(e).slice(0, 300) });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const body = await req.json();
    const status = body?.status;
    if (!status || !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
      return NextResponse.json({ error: "유효한 상태값이 아닙니다." }, { status: 400 });
    }
    const quotation = await prisma.quotation.update({
      where: { id },
      data: { status: status as (typeof VALID_STATUSES)[number] },
      include: {
        issuedBy: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(quotation);
  } catch (e) {
    console.error("[PATCH /api/quotations/[id]]", e);
    return NextResponse.json({ error: toErrorMessage(e).slice(0, 300) });
  }
}
