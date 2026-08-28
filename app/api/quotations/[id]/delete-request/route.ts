import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { canApproveQuotationDelete, canRequestQuotationDelete } from "@/lib/quotation-delete-access";
import {
  deleteQuotationRecord,
  notifyQuotationDeleteApprovers,
  notifyQuotationDeleteRequester,
} from "@/lib/quotation-delete";

export const runtime = "nodejs";

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "처리 중 오류가 발생했습니다.";
}

/** 삭제 요청 / 요청 취소 / 반려 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const action = body.action === "cancel" || body.action === "reject" ? body.action : "request";

    const existing = await prisma.quotation.findUnique({
      where: { id },
      select: {
        id: true,
        quotationNumber: true,
        title: true,
        issuedById: true,
        deleteRequestedAt: true,
        deleteRequestedById: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });
    }

    if (action === "request") {
      if (
        !canRequestQuotationDelete({
          role: session.user.role,
          userId: session.user.id,
          issuedById: existing.issuedById,
        })
      ) {
        return NextResponse.json(
          { error: "발행한 견적서만 삭제를 요청할 수 있습니다. 팀장급은 바로 삭제할 수 있습니다." },
          { status: 403 }
        );
      }
      if (existing.deleteRequestedAt) {
        return NextResponse.json({ error: "이미 삭제 승인을 기다리는 중입니다." }, { status: 409 });
      }
      await prisma.quotation.update({
        where: { id },
        data: {
          deleteRequestedAt: new Date(),
          deleteRequestedById: session.user.id,
        },
      });
      await notifyQuotationDeleteApprovers({
        actorId: session.user.id,
        actorName: session.user.name ?? "직원",
        quotationId: id,
        quotationNumber: existing.quotationNumber,
        title: existing.title,
      });
      revalidatePath("/quotations");
      revalidatePath(`/quotations/${id}`);
      return NextResponse.json({ ok: true, pending: true });
    }

    if (action === "cancel") {
      if (existing.deleteRequestedById !== session.user.id) {
        return NextResponse.json({ error: "본인이 요청한 삭제만 취소할 수 있습니다." }, { status: 403 });
      }
      if (!existing.deleteRequestedAt) {
        return NextResponse.json({ error: "대기 중인 삭제 요청이 없습니다." }, { status: 400 });
      }
      await prisma.quotation.update({
        where: { id },
        data: { deleteRequestedAt: null, deleteRequestedById: null },
      });
      revalidatePath("/quotations");
      revalidatePath(`/quotations/${id}`);
      return NextResponse.json({ ok: true, pending: false });
    }

    // reject
    if (!canApproveQuotationDelete(session.user.role)) {
      return NextResponse.json({ error: "팀장급만 삭제 요청을 반려할 수 있습니다." }, { status: 403 });
    }
    if (!existing.deleteRequestedAt) {
      return NextResponse.json({ error: "대기 중인 삭제 요청이 없습니다." }, { status: 400 });
    }
    const requesterId = existing.deleteRequestedById;
    await prisma.quotation.update({
      where: { id },
      data: { deleteRequestedAt: null, deleteRequestedById: null },
    });
    if (requesterId) {
      await notifyQuotationDeleteRequester({
        requesterId,
        actorId: session.user.id,
        quotationNumber: existing.quotationNumber,
        title: existing.title,
        quotationId: id,
        result: "rejected",
      });
    }
    revalidatePath("/quotations");
    revalidatePath(`/quotations/${id}`);
    return NextResponse.json({ ok: true, pending: false });
  } catch (e) {
    console.error("[POST /api/quotations/[id]/delete-request]", e);
    return NextResponse.json({ error: toErrorMessage(e).slice(0, 300) }, { status: 500 });
  }
}

/** 팀장급: 삭제 요청 승인 = 실제 삭제 (DELETE /api/quotations/[id]와 동일) */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canApproveQuotationDelete(session.user.role)) {
      return NextResponse.json({ error: "팀장급만 삭제 요청을 승인할 수 있습니다." }, { status: 403 });
    }
    const { id } = await params;
    const existing = await prisma.quotation.findUnique({
      where: { id },
      select: {
        id: true,
        quotationNumber: true,
        title: true,
        deleteRequestedById: true,
        deleteRequestedAt: true,
        projectId: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });
    }
    if (!existing.deleteRequestedAt) {
      return NextResponse.json({ error: "대기 중인 삭제 요청이 없습니다." }, { status: 400 });
    }
    const requesterId = existing.deleteRequestedById;
    await deleteQuotationRecord(id);
    if (requesterId) {
      await notifyQuotationDeleteRequester({
        requesterId,
        actorId: session.user.id,
        quotationNumber: existing.quotationNumber,
        title: existing.title,
        result: "approved",
      });
    }
    revalidatePath("/quotations");
    revalidateTag("dashboard-sales-stats", "default");
    if (existing.projectId) revalidatePath(`/projects/${existing.projectId}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/quotations/[id]/delete-request]", e);
    return NextResponse.json({ error: toErrorMessage(e).slice(0, 300) }, { status: 500 });
  }
}
