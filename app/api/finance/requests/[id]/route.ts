import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import {
  canCenterChiefApprovePaymentRequest,
  canTeamLeadApprovePaymentRequest,
  fetchDepartmentsWithTeamLead,
  isCsTeamDepartment,
  paymentRequestNeedsExecutiveDirectApproval,
  paymentRequestNeedsExecutiveFirstLineApproval,
} from "@/lib/finance-payment-request-policy";
import {
  authorizePaymentStatusChange,
  type PaymentStatus,
} from "@/lib/finance-payment-request-authorize";
import {
  ensurePaymentRequestAlerts,
  loadTransferExecutorIds,
  notifyCenterChiefsOnCsTeamLeadApproval,
  notifyExecutivesOnTeamLeadApproval,
  notifyTransferExecutorsOnApproval,
} from "@/lib/finance-payment-request-alerts";

// TODO(security): /finance/requests URL 직접 접근·API는 finance_view 미검사(메뉴만 숨김). 후속 가드 이슈.

const updateSchema = z.object({
  status: z.enum([
    "PENDING",
    "CENTER_CHIEF_APPROVED",
    "EXECUTIVE_PENDING",
    "TEAM_LEAD_APPROVED",
    "COMPLETED",
    "REJECTED",
  ]),
});

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
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const current = await prisma.paymentRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        requesterId: true,
        vendorId: true,
        amount: true,
        requestedAt: true,
        completedAt: true,
        description: true,
        attachment: true,
        attachments: true,
      },
    });
    if (!current) {
      return NextResponse.json({ error: "요청을 찾을 수 없습니다." }, { status: 404 });
    }

    if (parsed.data.status === current.status) {
      const row = await prisma.paymentRequest.findUnique({
        where: { id },
        include: {
          requester: { select: { id: true, name: true, email: true, position: true } },
          vendor: true,
        },
      });
      if (!row) return NextResponse.json({ error: "요청을 찾을 수 없습니다." }, { status: 404 });
      return NextResponse.json({
        noOp: true,
        id: row.id,
        status: row.status,
        amount: row.amount,
        requestedAt: row.requestedAt,
        completedAt: row.completedAt,
        description: row.description,
        attachment: row.attachment,
        attachments: row.attachments,
        requesterId: row.requesterId,
        vendorId: row.vendorId,
        requester: row.requester,
        vendor: row.vendor,
      });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, department: true },
    });
    const role = (dbUser?.role ?? session.user.role) as string | undefined;
    const isTeamLead = role === "TEAM_LEAD";
    const isCenterChief = role === "CENTER_CHIEF";
    const isExecutive = role === "EXECUTIVE" || role === "ADMIN";

    const transferExecutorIds = await loadTransferExecutorIds().catch(() => [] as string[]);
    const isTransferExecutor = transferExecutorIds.includes(session.user.id);

    const requesterRow = current.requesterId
      ? await prisma.user.findUnique({
          where: { id: current.requesterId },
          select: { name: true, department: true },
        })
      : null;
    const isCsRequest = isCsTeamDepartment(requesterRow?.department);
    const needsExecutiveFirstLine = paymentRequestNeedsExecutiveFirstLineApproval(
      current.requesterId,
      requesterRow?.name,
      transferExecutorIds
    );
    const departmentsWithTeamLeadSet = await fetchDepartmentsWithTeamLead(prisma);
    const needsExecutiveDirect =
      !needsExecutiveFirstLine &&
      paymentRequestNeedsExecutiveDirectApproval(
        requesterRow?.department,
        departmentsWithTeamLeadSet
      );

    const cur = current.status as PaymentStatus;
    const nextStatus = parsed.data.status as PaymentStatus;

    if (
      isTeamLead &&
      !isExecutive &&
      !needsExecutiveFirstLine &&
      (cur === "PENDING" || cur === "EXECUTIVE_PENDING" || cur === "CENTER_CHIEF_APPROVED") &&
      (nextStatus === "EXECUTIVE_PENDING" ||
        nextStatus === "CENTER_CHIEF_APPROVED" ||
        nextStatus === "REJECTED" ||
        nextStatus === "PENDING")
    ) {
      if (
        !canTeamLeadApprovePaymentRequest(
          dbUser?.department,
          requesterRow?.department,
          departmentsWithTeamLeadSet
        )
      ) {
        return NextResponse.json(
          { error: "같은 부서(팀) 요청만 1차 승인·반려할 수 있습니다." },
          { status: 403 }
        );
      }
      // CS팀 건은 팀장이 EXECUTIVE_PENDING으로 건너뛰지 못함
      if (isCsRequest && nextStatus === "EXECUTIVE_PENDING") {
        return NextResponse.json(
          { error: "CS팀 요청은 팀장 승인 후 센터장 결재가 필요합니다." },
          { status: 403 }
        );
      }
    }

    if (
      isCenterChief &&
      !isExecutive &&
      (cur === "CENTER_CHIEF_APPROVED" || cur === "EXECUTIVE_PENDING") &&
      (nextStatus === "EXECUTIVE_PENDING" ||
        nextStatus === "CENTER_CHIEF_APPROVED" ||
        nextStatus === "REJECTED")
    ) {
      if (!canCenterChiefApprovePaymentRequest(role, requesterRow?.department)) {
        return NextResponse.json(
          { error: "CS팀 요청만 센터장이 2차 승인·반려할 수 있습니다." },
          { status: 403 }
        );
      }
    }

    const auth = authorizePaymentStatusChange({
      cur,
      next: nextStatus,
      isTeamLead,
      isCenterChief,
      isExecutive,
      isTransferExecutor,
      needsExecutiveFirstLine,
      needsExecutiveDirect,
      isCsRequest,
    });
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const completedAt = nextStatus === "COMPLETED" ? new Date() : null;

    const updated = await prisma.paymentRequest.update({
      where: { id },
      data: { status: nextStatus, completedAt },
      include: {
        requester: { select: { id: true, name: true, email: true, position: true } },
        vendor: true,
      },
    });

    const now = new Date();

    try {
      if (
        (cur === "TEAM_LEAD_APPROVED" ||
          cur === "EXECUTIVE_PENDING" ||
          cur === "CENTER_CHIEF_APPROVED") &&
        (nextStatus === "PENDING" || nextStatus === "REJECTED")
      ) {
        await prisma.paymentRequestAlert.deleteMany({ where: { requestId: id } });
      }
    } catch (err) {
      console.error("[PATCH /api/finance/requests/:id] alert cleanup failed", err);
    }

    try {
      if (cur === "PENDING" && nextStatus === "CENTER_CHIEF_APPROVED") {
        await notifyCenterChiefsOnCsTeamLeadApproval(id);
      }
      if (
        (cur === "PENDING" && nextStatus === "EXECUTIVE_PENDING") ||
        (cur === "CENTER_CHIEF_APPROVED" && nextStatus === "EXECUTIVE_PENDING")
      ) {
        await notifyExecutivesOnTeamLeadApproval(id);
      }
      if (
        (cur === "EXECUTIVE_PENDING" ||
          (cur === "PENDING" && (needsExecutiveFirstLine || needsExecutiveDirect))) &&
        nextStatus === "TEAM_LEAD_APPROVED"
      ) {
        await notifyTransferExecutorsOnApproval(id);
      }
    } catch (err) {
      console.error("[PATCH /api/finance/requests/:id] alert notify failed", err);
    }

    try {
      if (nextStatus === "COMPLETED" && current.requesterId) {
        await ensurePaymentRequestAlerts(id, [current.requesterId]);
      }
    } catch (err) {
      console.error("[PATCH /api/finance/requests/:id] alert create for requester failed", err);
    }

    try {
      await prisma.paymentRequestAlert.updateMany({
        where: { requestId: id, userId: session.user.id },
        data: { readAt: now },
      });
    } catch (err) {
      console.error("[PATCH /api/finance/requests/:id] alert readAt update failed", err);
    }

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      amount: updated.amount,
      requestedAt: updated.requestedAt,
      completedAt: updated.completedAt,
      description: updated.description,
      attachment: updated.attachment,
      attachments: updated.attachments,
      requesterId: updated.requesterId,
      vendorId: updated.vendorId,
      requester: updated.requester,
      vendor: updated.vendor,
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "처리 상태 변경에 실패했습니다.", details: msg },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    const current = await prisma.paymentRequest.findUnique({
      where: { id },
      select: { id: true, requesterId: true, status: true },
    });
    if (!current) {
      return NextResponse.json({ error: "요청을 찾을 수 없습니다." }, { status: 404 });
    }
    if (current.requesterId !== session.user.id) {
      return NextResponse.json({ error: "본인 요청만 삭제할 수 있습니다." }, { status: 403 });
    }
    if (current.status === "COMPLETED") {
      return NextResponse.json({ error: "이체 완료된 요청은 삭제할 수 없습니다." }, { status: 400 });
    }

    await prisma.paymentRequest.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }
}
