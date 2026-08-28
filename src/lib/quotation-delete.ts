import prisma from "@/lib/prisma";
import { createNotificationWithOptions, createNotificationsForManyUsers } from "@/lib/notifications";

const APPROVER_ROLES = ["TEAM_LEAD", "CENTER_CHIEF", "EXECUTIVE", "ADMIN"] as const;

export async function findQuotationDeleteApproverIds(excludeUserId: string): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: {
      accountDisabled: false,
      id: { not: excludeUserId },
      role: { in: [...APPROVER_ROLES] },
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function notifyQuotationDeleteApprovers(opts: {
  actorId: string;
  actorName: string;
  quotationId: string;
  quotationNumber: string;
  title: string;
}): Promise<void> {
  const userIds = await findQuotationDeleteApproverIds(opts.actorId);
  if (userIds.length === 0) return;
  await createNotificationsForManyUsers({
    userIds,
    type: "QUOTATION_DELETE",
    message: `${opts.actorName}님이 견적서 ${opts.quotationNumber}(${opts.title}) 삭제를 요청했습니다.`,
    link: `/quotations/${opts.quotationId}`,
    actorId: opts.actorId,
  });
}

export async function notifyQuotationDeleteRequester(opts: {
  requesterId: string;
  actorId: string;
  quotationNumber: string;
  title: string;
  quotationId?: string;
  result: "approved" | "rejected";
}): Promise<void> {
  if (opts.requesterId === opts.actorId) return;
  const approved = opts.result === "approved";
  await createNotificationWithOptions({
    userId: opts.requesterId,
    type: "QUOTATION_DELETE",
    message: approved
      ? `견적서 ${opts.quotationNumber}(${opts.title}) 삭제 요청이 승인되어 삭제되었습니다.`
      : `견적서 ${opts.quotationNumber}(${opts.title}) 삭제 요청이 반려되었습니다.`,
    link: approved ? "/quotations" : `/quotations/${opts.quotationId}`,
    actorId: opts.actorId,
    pushTitle: approved ? "견적서 삭제 승인" : "견적서 삭제 반려",
  });
}

/** 프로젝트 주견적 연결을 끊은 뒤 견적서를 삭제한다. */
export async function deleteQuotationRecord(quotationId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const q = await tx.quotation.findUnique({
      where: { id: quotationId },
      select: { id: true, projectId: true },
    });
    if (!q) return;
    if (q.projectId) {
      const proj = await tx.project.findUnique({
        where: { id: q.projectId },
        select: { id: true, quoteId: true },
      });
      if (proj?.quoteId === quotationId) {
        await tx.project.update({
          where: { id: q.projectId },
          data: { quoteId: null, quoteAmount: 0, dueDate: null },
        });
      }
    }
    await tx.quotation.delete({ where: { id: quotationId } });
  });
}
