import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { syncQuotationProjectLink } from "@/lib/quote-project-link";
import { notifyProjectCompletedStakeholders } from "@/lib/project-completion-notify";

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
    const isAdmin = (session.user as { role?: string }).role === "EXECUTIVE" || (session.user as { role?: string }).role === "ADMIN";
    if (existing.issuedById != null && existing.issuedById !== session.user.id && !isAdmin) {
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
    if (body.issuedAt !== undefined) {
      const raw = String(body.issuedAt ?? "").trim().slice(0, 10);
      if (!raw) {
        return NextResponse.json({ error: "발행일을 입력하세요." });
      }
      const idate = new Date(`${raw}T12:00:00`);
      if (Number.isNaN(idate.getTime())) {
        return NextResponse.json({ error: "발행일(작성일) 형식이 올바르지 않습니다." });
      }
      updateData.issuedAt = idate;
    }

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
          data: items.map((item: any, idx: any) => {
            const up = Number(item?.unitPrice);
            const amt = Number(item?.amount);
            return {
              quotationId: id,
              description: String(item?.description ?? "").trim() || "(품목)",
              quantity: Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 0,
              unitPrice: Number.isFinite(up) ? up : 0,
              amount: Number.isFinite(amt) ? amt : 0,
              sortOrder: idx,
            };
          }),
        });
      }
    });
    revalidatePath("/quotations");
    revalidatePath(`/quotations/${id}`);
    revalidateTag("dashboard-sales-stats", "default");
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
    const body = await req.json().catch(() => ({}));
    const status = body?.status as string | undefined;
    const projectId = body?.projectId as string | null | undefined;

    if (status === undefined && projectId === undefined) {
      return NextResponse.json({ error: "변경할 항목이 없습니다." }, { status: 400 });
    }
    if (status !== undefined && !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
      return NextResponse.json({ error: "유효한 상태값이 아닙니다." }, { status: 400 });
    }
    if (
      projectId !== undefined &&
      projectId !== null &&
      (typeof projectId !== "string" || projectId.length === 0)
    ) {
      return NextResponse.json({ error: "projectId가 올바르지 않습니다." }, { status: 400 });
    }

    const existing = await prisma.quotation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });
    }
    const isAdmin =
      (session.user as { role?: string }).role === "EXECUTIVE" ||
      (session.user as { role?: string }).role === "ADMIN";
    const canPatch =
      existing.issuedById == null || existing.issuedById === session.user.id || isAdmin;
    if (!canPatch) {
      return NextResponse.json({ error: "견적서 발행자만 수정할 수 있습니다." }, { status: 403 });
    }

    const prevStatus = existing.status;

    try {
      await prisma.$transaction(async (tx) => {
        if (projectId !== undefined) {
          await syncQuotationProjectLink(tx, {
            quotationId: id,
            projectId: projectId === null ? null : projectId,
          });
        }
        if (status !== undefined) {
          await tx.quotation.update({
            where: { id },
            data: { status: status as (typeof VALID_STATUSES)[number] },
          });
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "PROJECT_NOT_FOUND") {
        return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
      }
      throw err;
    }

    if (
      status !== undefined &&
      prevStatus !== "COMPLETED" &&
      status === "COMPLETED"
    ) {
      try {
        const qSnap = await prisma.quotation.findUnique({
          where: { id },
          select: { projectId: true },
        });
        let notifyProjectId = qSnap?.projectId ?? null;
        if (!notifyProjectId) {
          const byPrimaryQuote = await prisma.project.findFirst({
            where: { quoteId: id, deletedAt: null },
            select: { id: true },
          });
          notifyProjectId = byPrimaryQuote?.id ?? null;
        }
        if (notifyProjectId) {
          await notifyProjectCompletedStakeholders({
            projectId: notifyProjectId,
            actorUserId: session.user.id,
          });
        }
      } catch (notifyErr) {
        console.error("[PATCH /api/quotations/[id]] project completed notify", notifyErr);
      }
    }

    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: {
        issuedBy: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
    });
    revalidatePath("/quotations");
    revalidatePath(`/quotations/${id}`);
    revalidateTag("dashboard-sales-stats", "default");
    if (quotation?.projectId) {
      revalidatePath(`/projects/${quotation.projectId}`);
    }
    return NextResponse.json(quotation);
  } catch (e) {
    console.error("[PATCH /api/quotations/[id]]", e);
    return NextResponse.json({ error: toErrorMessage(e).slice(0, 300) });
  }
}
