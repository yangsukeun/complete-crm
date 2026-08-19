import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export async function syncCsClientAssignmentPeriods(
  tx: Tx,
  opts: {
    clientId: string;
    next: { userId: string; roleLabel: string }[];
    today: string;
  }
) {
  const open = await tx.csClientAssignmentPeriod.findMany({
    where: { clientId: opts.clientId, endedOn: null },
  });
  const nextIds = new Set(opts.next.map((n) => n.userId));
  const openByUser = new Map(open.map((p) => [p.userId, p]));

  for (const period of open) {
    if (!nextIds.has(period.userId)) {
      await tx.csClientAssignmentPeriod.update({
        where: { id: period.id },
        data: { endedOn: opts.today },
      });
    }
  }

  for (const n of opts.next) {
    const current = openByUser.get(n.userId);
    if (current) {
      if (current.roleLabel !== n.roleLabel) {
        await tx.csClientAssignmentPeriod.update({
          where: { id: current.id },
          data: { roleLabel: n.roleLabel },
        });
      }
      continue;
    }
    await tx.csClientAssignmentPeriod.create({
      data: {
        clientId: opts.clientId,
        userId: n.userId,
        startedOn: opts.today,
        roleLabel: n.roleLabel,
      },
    });
  }
}
