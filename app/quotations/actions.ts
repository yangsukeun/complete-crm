"use server";

import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

const DATE_PREFIX = "EST-"; // YYYYMMDD
const PAD_LEN = 2; // 01, 02, ...

/** 오늘 날짜 기준 마지막 견적 번호 찾아 +1 (예: EST-240211-01) */
export async function getNextQuotationNumber(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
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
  items: QuotationItemInput[];
  remarks?: string | null;
};

export async function createQuotation(input: CreateQuotationInput): Promise<{ id: string } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "로그인이 필요합니다." };

  const number = await getNextQuotationNumber();
  const totalAmount = input.items.reduce((sum, i) => sum + i.amount, 0);
  const vatAmount = Math.floor(totalAmount * 0.1);
  const finalAmount = totalAmount + vatAmount;

  const quotation = await prisma.quotation.create({
    data: {
      quotationNumber: number,
      title: input.title,
      clientName: input.clientName,
      validUntil: new Date(input.validUntil),
      totalAmount,
      vatAmount,
      finalAmount,
      status: "DRAFT",
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
  return { id: quotation.id };
}

export type UpdateQuotationInput = {
  title?: string;
  clientName?: string;
  validUntil?: string;
  items?: QuotationItemInput[];
  remarks?: string | null;
};

export async function updateQuotation(
  id: string,
  input: UpdateQuotationInput
): Promise<{ ok: true } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "로그인이 필요합니다." };

  const existing = await prisma.quotation.findUnique({ where: { id }, include: { items: true } });
  if (!existing) return { error: "견적서를 찾을 수 없습니다." };

  let totalAmount = existing.totalAmount;
  let vatAmount = existing.vatAmount;
  let finalAmount = existing.finalAmount;
  const updateData: Parameters<typeof prisma.quotation.update>[0]["data"] = {};

  if (input.title !== undefined) updateData.title = input.title;
  if (input.clientName !== undefined) updateData.clientName = input.clientName;
  if (input.validUntil !== undefined) updateData.validUntil = new Date(input.validUntil);
  if (input.remarks !== undefined) updateData.remarks = input.remarks;

  if (input.items !== undefined && input.items.length > 0) {
    totalAmount = input.items.reduce((sum, i) => sum + i.amount, 0);
    vatAmount = Math.floor(totalAmount * 0.1);
    finalAmount = totalAmount + vatAmount;
    updateData.totalAmount = totalAmount;
    updateData.vatAmount = vatAmount;
    updateData.finalAmount = finalAmount;
  }

  await prisma.$transaction(async (tx) => {
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
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  return { ok: true };
}
