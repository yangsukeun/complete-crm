import type { Prisma } from "@prisma/client";

type Tx = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/** 견적 ↔ 프로젝트 연결을 양방향으로 맞춥니다. projectId가 null이면 연결 해제입니다. */
export async function syncQuotationProjectLink(
  tx: Tx,
  args: { quotationId: string; projectId: string | null }
): Promise<void> {
  const { quotationId, projectId } = args;
  const q = await tx.quotation.findUnique({ where: { id: quotationId } });
  if (!q) {
    throw new Error("QUOTATION_NOT_FOUND");
  }

  if (projectId === null) {
    if (q.projectId) {
      const prevProj = await tx.project.findUnique({ where: { id: q.projectId } });
      if (prevProj?.quoteId === quotationId) {
        await tx.project.update({
          where: { id: q.projectId },
          data: { quoteId: null, quoteAmount: 0, dueDate: null },
        });
      }
    }
    await tx.quotation.update({
      where: { id: quotationId },
      data: { projectId: null },
    });
    return;
  }

  const proj = await tx.project.findUnique({ where: { id: projectId } });
  if (!proj) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  if (proj.quoteId && proj.quoteId !== quotationId) {
    await tx.quotation.updateMany({
      where: { id: proj.quoteId, projectId },
      data: { projectId: null },
    });
  }

  if (q.projectId && q.projectId !== projectId) {
    const oldProj = await tx.project.findUnique({ where: { id: q.projectId } });
    if (oldProj?.quoteId === quotationId) {
      await tx.project.update({
        where: { id: q.projectId },
        data: { quoteId: null },
      });
    }
  }

  await tx.quotation.update({
    where: { id: quotationId },
    data: { projectId },
  });
  await tx.project.update({
    where: { id: projectId },
    data: {
      quoteId: quotationId,
      quoteAmount: q.finalAmount,
      dueDate: q.validUntil,
    },
  });
}
