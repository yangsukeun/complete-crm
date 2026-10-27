import {resolveFinanceAccess,redactPaymentBank} from "@/lib/finance-access";
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
  notifyPaymentRequestDeleted,
  notifyTransferExecutorsOnApproval,
} from "@/lib/finance-payment-request-alerts";
import { isPaymentRequestInFinanceScope } from "@/lib/finance-scope";

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

const resolveViewerFinanceScope=resolveFinanceAccess;

/** 상세 조회 — 스코프 밖이면 403 */
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

    const row = await prisma.paymentRequest.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, name: true, email: true, position: true, department: true } },
        vendor: true,
        quotation: { select: { id: true, quotationNumber: true, title: true, finalAmount: true, clientName: true } },
      },
    });
    if (!row) {
      return NextResponse.json({ error: "요청을 찾을 수 없습니다." }, { status: 404 });
    }

    const { scope } = await resolveViewerFinanceScope(session.user.id);
    if (!isPaymentRequestInFinanceScope(scope, row)) {
      return NextResponse.json({ error: "조회 권한이 없습니다." }, { status: 403 });
    }

    return NextResponse.json({
      ...redactPaymentBank(row,scope),
      financeScope: { kind: scope.kind, label: scope.label },
    },{headers:{"Cache-Control":"private, no-store",Vary:"Cookie"}});
  } catch (e) {
    console.error("[GET /api/finance/requests/:id]", e);
    return NextResponse.json({ error: "결제 요청을 불러올 수 없습니다." }, { status: 500 });
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

    const {
      scope,
      role: scopedRole,
      department: viewerDepartment,
      transferExecutorIds,
    } = await resolveViewerFinanceScope(session.user.id,"write");

    const requesterRowEarly = current.requesterId
      ? await prisma.user.findUnique({
          where: { id: current.requesterId },
          select: { name: true, department: true },
        })
      : null;

    if (
      !isPaymentRequestInFinanceScope(scope, {
        requesterId: current.requesterId,
        requester: requesterRowEarly,
      })
    ) {
      return NextResponse.json({ error: "조회 권한이 없습니다." }, { status: 403 });
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
        vendor: redactPaymentBank(row,scope).vendor,
      });
    }

    const role = (scopedRole ?? session.user.role) as string | undefined;
    const isTeamLead = role === "TEAM_LEAD";
    const isCenterChief = role === "CENTER_CHIEF";
    const isExecutive = role === "EXECUTIVE" || role === "ADMIN";
    const isTransferExecutor = transferExecutorIds.includes(session.user.id);

    const requesterRow = requesterRowEarly;
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
          viewerDepartment,
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
      if ((nextStatus === "COMPLETED" || nextStatus === "REJECTED") && current.requesterId) {
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
      vendor: redactPaymentBank(updated,scope).vendor,
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

const deleteSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

/**
 * 삭제 권한
 * - 요청자 본인: 이체 완료 전까지
 * - 이체 담당자·대표(승인자): 승인이 끝나 이체를 기다리는 건(TEAM_LEAD_APPROVED)만, 사유 필수.
 *   승인 후 이체가 필요 없어진 건을 요청자 없이도 정리할 수 있게 하기 위함.
 *   삭제하면 요청자와 다른 대표에게 사유를 담아 알린다.
 */
export async function DELETE(
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
    const parsed = deleteSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: "삭제 사유가 올바르지 않습니다." }, { status: 400 });
    }
    const reason = parsed.data.reason ?? "";

    const current = await prisma.paymentRequest.findUnique({
      where: { id },
      select: {
        id: true,
        requesterId: true,
        status: true,
        amount: true,
        vendor: { select: { name: true } },
      },
    });
    if (!current) {
      return NextResponse.json({ error: "요청을 찾을 수 없습니다." }, { status: 404 });
    }
    if (current.status === "COMPLETED") {
      return NextResponse.json({ error: "이체 완료된 요청은 삭제할 수 없습니다." }, { status: 400 });
    }

    const {scope}=await resolveFinanceAccess(session.user.id,"write");
    const requester=current.requesterId?await prisma.user.findUnique({where:{id:current.requesterId},select:{department:true}}):null;
    if(!isPaymentRequestInFinanceScope(scope,{...current,requester}))return NextResponse.json({error:"Forbidden"},{status:403});
    const deletedByManager = current.requesterId !== session.user.id;
    if (deletedByManager) {
      const actor = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
      });
      const role = actor?.role ?? session.user.role;
      const isExecutive = role === "EXECUTIVE" || role === "ADMIN";
      const transferExecutorIds = await loadTransferExecutorIds().catch(() => [] as string[]);
      if (!isExecutive && !transferExecutorIds.includes(session.user.id)) {
        return NextResponse.json({ error: "본인 요청만 삭제할 수 있습니다." }, { status: 403 });
      }
      if (current.status !== "TEAM_LEAD_APPROVED") {
        return NextResponse.json(
          { error: "승인이 끝나 이체를 기다리는 요청만 삭제할 수 있습니다." },
          { status: 400 }
        );
      }
      if (!reason) {
        return NextResponse.json({ error: "삭제 사유를 입력해 주세요." }, { status: 400 });
      }
    }

    await prisma.paymentRequest.delete({ where: { id } });

    if (deletedByManager) {
      try {
        await notifyPaymentRequestDeleted({
          actorId: session.user.id,
          requesterId: current.requesterId,
          vendorName: current.vendor?.name ?? null,
          amount: current.amount,
          reason,
        });
      } catch (err) {
        console.error("[DELETE /api/finance/requests/:id] delete notify failed", err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }
}
