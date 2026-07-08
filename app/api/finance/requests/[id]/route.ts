import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { paymentRequestNeedsExecutiveFirstLineApproval } from "@/lib/finance-payment-request-policy";
import {
  ensurePaymentRequestAlerts,
  loadTransferExecutorIds,
  notifyTransferExecutorsOnApproval,
} from "@/lib/finance-payment-request-alerts";

const updateSchema = z.object({
  status: z.enum(["PENDING", "TEAM_LEAD_APPROVED", "COMPLETED", "REJECTED"]),
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

    /** UI 더블클릭/레이스 등으로 같은 상태로 다시 PATCH가 들어오면 no-op으로 성공 처리 */
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
      select: { role: true },
    });
    const role = (dbUser?.role ?? session.user.role) as string | undefined;
    const isTeamLead = role === "TEAM_LEAD";
    const isExecutiveApprover = role === "EXECUTIVE" || role === "ADMIN";

    let transferExecutorIds: string[] = [];
    try {
      transferExecutorIds = await loadTransferExecutorIds();
    } catch (err) {
      console.error("[PATCH /api/finance/requests/:id] transferExecutorIds read failed", err);
      transferExecutorIds = [];
    }
    const isTransferExecutor = transferExecutorIds.includes(session.user.id);

    const requesterRow = current.requesterId
      ? await prisma.user.findUnique({
          where: { id: current.requesterId },
          select: { name: true },
        })
      : null;
    const needsExecutiveFirstLine = paymentRequestNeedsExecutiveFirstLineApproval(
      current.requesterId,
      requesterRow?.name,
      transferExecutorIds
    );
    /** 이체 담당자·김소윤 요청: 1차 승인·반려·되돌리기는 대표/임원만. 그 외는 팀장 또는 대표/임원 */
    const canFirstLineApprove = needsExecutiveFirstLine
      ? isExecutiveApprover
      : isTeamLead || isExecutiveApprover;

    // 팀장·(해당 건) 대표/임원: PENDING → 이체대기(TEAM_LEAD_APPROVED) / 반려. 이체대기 건 → 승인대기로 되돌리기·반려 가능.
    if (canFirstLineApprove) {
      if (parsed.data.status === "COMPLETED") {
        return NextResponse.json(
          { error: "이체 완료는 이체 담당자만 처리할 수 있습니다." },
          { status: 403 }
        );
      }
      if (current.status === "PENDING") {
        if (parsed.data.status !== "TEAM_LEAD_APPROVED" && parsed.data.status !== "REJECTED") {
          return NextResponse.json({ error: "승인 또는 반려만 가능합니다." }, { status: 400 });
        }
      } else if (current.status === "TEAM_LEAD_APPROVED") {
        if (parsed.data.status !== "PENDING" && parsed.data.status !== "REJECTED") {
          return NextResponse.json({ error: "승인 대기로 되돌리기 또는 반려만 가능합니다." }, { status: 400 });
        }
      } else {
        return NextResponse.json(
          { error: "승인대기 또는 이체대기 건만 처리할 수 있습니다." },
          { status: 400 }
        );
      }
    }

    /**
     * 이체 담당자(팀장·임원 제외한 순수 담당자): TEAM_LEAD_APPROVED → COMPLETED 만 가능.
     * 팀장 전용 이체 담당자는 1차 승인 권한이 없으므로 canFirstLineApprove 가 false 일 때 여기로 옴.
     */
    if (isTransferExecutor && !canFirstLineApprove) {
      if (parsed.data.status !== "COMPLETED") {
        return NextResponse.json(
          { error: "이체 담당자는 이체 완료만 처리할 수 있습니다." },
          { status: 403 }
        );
      }
      if (current.status !== "TEAM_LEAD_APPROVED") {
        return NextResponse.json(
          { error: "팀장 승인된 건만 이체 완료할 수 있습니다." },
          { status: 400 }
        );
      }
    }

    if (!canFirstLineApprove && !isTransferExecutor) {
      if (needsExecutiveFirstLine && isTeamLead) {
        return NextResponse.json(
          { error: "이체 담당자가 올린 요청은 대표(임원)만 승인할 수 있습니다." },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: "결재 담당자(팀장·대표/임원) 또는 이체 담당자만 처리할 수 있습니다." },
        { status: 403 }
      );
    }

    const completedAt = parsed.data.status === "COMPLETED" ? new Date() : null;
    const newStatus = parsed.data.status as "PENDING" | "TEAM_LEAD_APPROVED" | "COMPLETED" | "REJECTED";

    const updated = await prisma.paymentRequest.update({
      where: { id },
      data: { status: newStatus, completedAt },
      include: {
        requester: { select: { id: true, name: true, email: true, position: true } },
        vendor: true,
      },
    });

    const now = new Date();

    /**
     * 아래 알림/후처리는 "승인 상태 변경"의 부가 작업이므로 실패해도 PATCH 자체는 성공이어야 한다.
     * (배포 환경에서 스키마 지연/권한/중복 알림 레이스 등으로 예외가 나면 UI는 실패로 뜨지만 DB는 이미 변경됨)
     */
    try {
      // 이체대기 → 승인대기/반려 되돌리기: 해당 건 알람 전부 삭제
      if (
        current.status === "TEAM_LEAD_APPROVED" &&
        (parsed.data.status === "PENDING" || parsed.data.status === "REJECTED")
      ) {
        await prisma.paymentRequestAlert.deleteMany({ where: { requestId: id } });
      }
    } catch (err) {
      console.error("[PATCH /api/finance/requests/:id] alert cleanup failed", err);
    }

    try {
      // 1차 승인 시: 이체 담당자에게 알람 (raw SQL — Prisma create 실패 방지)
      if (canFirstLineApprove && parsed.data.status === "TEAM_LEAD_APPROVED") {
        await notifyTransferExecutorsOnApproval(id);
      }
    } catch (err) {
      console.error("[PATCH /api/finance/requests/:id] alert create for transfer executors failed", err);
    }

    try {
      // 이체완료 시: 요청자(담당자)에게 알람
      if (parsed.data.status === "COMPLETED" && current.requesterId) {
        await ensurePaymentRequestAlerts(id, [current.requesterId]);
      }
    } catch (err) {
      console.error("[PATCH /api/finance/requests/:id] alert create for requester failed", err);
    }

    try {
      // 처리한 사람 본인 알람 읽음 처리
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
      select: { id: true, status: true, requesterId: true },
    });
    if (!current) {
      return NextResponse.json({ error: "요청을 찾을 수 없습니다." }, { status: 404 });
    }

    // 완료(COMPLETED)된 건은 삭제 불가
    if (current.status === "COMPLETED") {
      return NextResponse.json({ error: "이체 완료된 건은 삭제할 수 없습니다." }, { status: 400 });
    }

    // 요청자 본인만 삭제 가능
    if (!current.requesterId || current.requesterId !== session.user.id) {
      return NextResponse.json({ error: "본인이 요청한 건만 삭제할 수 있습니다." }, { status: 403 });
    }

    await prisma.paymentRequest.delete({ where: { id } });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "삭제에 실패했습니다.", details: msg }, { status: 500 });
  }
}
