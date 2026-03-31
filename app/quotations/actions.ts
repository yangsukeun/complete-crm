"use server";

import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "next/cache";

const DATE_PREFIX = "EST-"; // YYYYMMDD
const PAD_LEN = 2; // 01, 02, ...

/** 발행일 기준 마지막 견적 번호 찾아 +1 (예: EST-240211-01). 생략 시 오늘. */
export async function getNextQuotationNumber(issueDate?: Date): Promise<string> {
  const session = await getAppSession();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const base = issueDate && !Number.isNaN(issueDate.getTime()) ? issueDate : new Date();
  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  const dateStr = `${yyyy}${mm}${dd}`;
  const prefix = `${DATE_PREFIX}${dateStr}-`;

  const last = await prisma.quotation.findFirst({
    where: { quotationNumber: { startsWith: prefix } },
    orderBy: { quotationNumber: "desc" },
    select: { quotationNumber: true },
  });

  let nextNum = 1;
  if (last) {
    const suffix = last.quotationNumber.slice(prefix.length);
    const n = parseInt(suffix, 10);
    if (!Number.isNaN(n)) nextNum = n + 1;
  }
  const seq = String(nextNum).padStart(PAD_LEN, "0");
  return `${prefix}${seq}`;
}

export type QuotationItemInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export type CreateQuotationInput = {
  title: string;
  clientName: string;
  validUntil: string; // ISO date
  /** 발행일(견적 작성일) yyyy-MM-dd — 통계 월·문서번호 일자에 사용. 생략 시 오늘 */
  issuedAt?: string | null;
  items: QuotationItemInput[];
  remarks?: string | null;
  /** 부가세 포함 총액을 사용자가 직접 지정할 때(원 단위). 비우면 품목 합계 기준 자동 계산 */
  finalAmountOverride?: number | null;
};

function calcAmountsFromFinal(finalAmount: number): { totalAmount: number; vatAmount: number; finalAmount: number } {
  const final = Math.max(0, Math.floor(finalAmount));
  const total = Math.max(0, Math.round(final / 1.1)); // 원 단위 반올림(공급가)
  const vat = Math.max(0, final - total);
  return { totalAmount: total, vatAmount: vat, finalAmount: final };
}

export async function createQuotation(input: CreateQuotationInput): Promise<{ id: string } | { error: string }> {
  const session = await getAppSession();
  if (!session?.user?.id) return { error: "로그인이 필요합니다." };

  const issuedDayRaw = (input.issuedAt ?? "").trim();
  const issuedDay = issuedDayRaw
    ? new Date(`${issuedDayRaw}T12:00:00`)
    : new Date();
  if (Number.isNaN(issuedDay.getTime())) return { error: "발행일(작성일)이 올바르지 않습니다." };

  const number = await getNextQuotationNumber(issuedDay);
  const computedTotal = input.items.reduce((sum, i) => sum + i.amount, 0);
  const computedVat = Math.floor(computedTotal * 0.1);
  const computedFinal = computedTotal + computedVat;
  const override = input.finalAmountOverride;
  const { totalAmount, vatAmount, finalAmount } =
    typeof override === "number" && Number.isFinite(override) && override >= 0
      ? calcAmountsFromFinal(override)
      : { totalAmount: computedTotal, vatAmount: computedVat, finalAmount: computedFinal };

  const quotation = await prisma.quotation.create({
    data: {
      quotationNumber: number,
      title: input.title,
      clientName: input.clientName,
      validUntil: new Date(input.validUntil),
      issuedAt: issuedDay,
      totalAmount,
      vatAmount,
      finalAmount,
      status: "IN_PROGRESS",
      issuedById: session.user.id,
      remarks: input.remarks || null,
      items: {
        create: input.items.map((item, idx) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.amount,
          sortOrder: idx,
        })),
      },
    },
  });
  revalidatePath("/quotations");
  try {
    revalidateTag("dashboard-sales-stats", "default");
  } catch (e) {
    console.warn("[createQuotation] revalidateTag", e);
  }
  return { id: quotation.id };
}

export type UpdateQuotationInput = {
  title?: string;
  clientName?: string;
  validUntil?: string;
  items?: QuotationItemInput[];
  remarks?: string | null;
  /** 부가세 포함 총액을 사용자가 직접 지정할 때(원 단위). null/undefined면 자동 계산 */
  finalAmountOverride?: number | null;
};

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return String(e);
  } catch {
    return "수정 중 오류가 발생했습니다.";
  }
}

export async function updateQuotation(
  id: string,
  input: UpdateQuotationInput
): Promise<{ ok: true } | { error: string }> {
  try {
    if (!id || typeof id !== "string") return { error: "견적서 ID가 없습니다." };
    return await updateQuotationInternal(id, input);
  } catch (e) {
    console.error("[updateQuotation] outer", e);
    return { error: toErrorMessage(e).slice(0, 300) };
  }
}

async function updateQuotationInternal(
  id: string,
  input: UpdateQuotationInput
): Promise<{ ok: true } | { error: string }> {
  const session = await getAppSession();
  if (!session?.user?.id) return { error: "로그인이 필요합니다." };

  const existing = await prisma.quotation.findUnique({ where: { id }, include: { items: true } });
  if (!existing) return { error: "견적서를 찾을 수 없습니다." };
  if (existing.issuedById !== session.user.id) return { error: "견적서 발행자만 수정할 수 있습니다." };

  let totalAmount = existing.totalAmount;
  let vatAmount = existing.vatAmount;
  let finalAmount = existing.finalAmount;
  const updateData: Parameters<typeof prisma.quotation.update>[0]["data"] = {};

  if (input.title !== undefined) updateData.title = input.title;
  if (input.clientName !== undefined) updateData.clientName = input.clientName;
  if (input.validUntil !== undefined) {
    const d = new Date(input.validUntil);
    if (Number.isNaN(d.getTime())) return { error: "유효기간 날짜 형식이 올바르지 않습니다." };
    updateData.validUntil = d;
  }
  if (input.remarks !== undefined) updateData.remarks = input.remarks;

  if (input.items !== undefined && input.items.length > 0) {
    totalAmount = input.items.reduce((sum, i) => sum + i.amount, 0);
    vatAmount = Math.floor(totalAmount * 0.1);
    finalAmount = totalAmount + vatAmount;
    updateData.totalAmount = totalAmount;
    updateData.vatAmount = vatAmount;
    updateData.finalAmount = finalAmount;
  }

  if (input.finalAmountOverride !== undefined && input.finalAmountOverride !== null) {
    if (typeof input.finalAmountOverride !== "number" || !Number.isFinite(input.finalAmountOverride) || input.finalAmountOverride < 0) {
      return { error: "총합계(부가세 포함) 금액이 올바르지 않습니다." };
    }
    const c = calcAmountsFromFinal(input.finalAmountOverride);
    totalAmount = c.totalAmount;
    vatAmount = c.vatAmount;
    finalAmount = c.finalAmount;
    updateData.totalAmount = totalAmount;
    updateData.vatAmount = vatAmount;
    updateData.finalAmount = finalAmount;
  }

  if (Object.keys(updateData).length === 0) {
    if (input.items === undefined || input.items.length === 0) return { error: "수정할 내용이 없습니다." };
    updateData.remarks = existing.remarks ?? null;
  }

  try {
    await prisma.$transaction(async (tx: any) => {
      await tx.quotation.update({
        where: { id },
        data: updateData,
      });
      if (input.items !== undefined) {
        await tx.quotationItem.deleteMany({ where: { quotationId: id } });
        await tx.quotationItem.createMany({
          data: input.items.map((item, idx) => ({
            quotationId: id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: item.amount,
            sortOrder: idx,
          })),
        });
      }
    });
  } catch (e) {
    console.error("[updateQuotation] transaction", e);
    return { error: toErrorMessage(e).slice(0, 300) };
  }

  try {
    revalidatePath("/quotations");
    revalidatePath(`/quotations/${id}`);
  } catch (revalErr) {
    console.warn("[updateQuotation] revalidatePath", revalErr);
  }
  try {
    revalidateTag("dashboard-sales-stats", "default");
  } catch (e) {
    console.warn("[updateQuotation] revalidateTag", e);
  }
  return { ok: true };
}
