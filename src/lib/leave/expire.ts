import prisma from "@/lib/prisma";
import { createNotificationWithOptions } from "@/lib/notifications";
import { startOfKstDay } from "@/lib/leave/kst-date";

export { markExpiredAccrualsPlain } from "@/lib/leave/expire-plain";

/**
 * 만료 도래분 처리. useEncouragementEnabled=false 이고 잔여가 있으면 compensationOwed + 임원 알림.
 */
export async function expireDueAccruals(asOf: Date = new Date()): Promise<number> {
  const company = await prisma.companyInfo.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { useEncouragementEnabled: true },
  });
  const encouragement = company?.useEncouragementEnabled === true;

  const boundary = startOfKstDay(asOf);

  const due = await prisma.leaveAccrual.findMany({
    where: {
      isExpired: false,
      expiresAt: { lte: boundary },
    },
  });

  let count = 0;
  for (const row of due) {
    const granted = row.days;
    const consumed = Math.min(row.consumedDays, granted);
    const remaining = Math.max(0, granted - consumed);
    const owe = !encouragement && remaining > 0.0001;

    await prisma.leaveAccrual.update({
      where: { id: row.id },
      data: {
        isExpired: true,
        expiredAt: boundary,
        compensationOwed: owe,
      },
    });
    count++;

    if (owe) {
      const admins = await prisma.user.findMany({
        where: { role: { in: ["EXECUTIVE", "ADMIN"] } },
        select: { id: true },
      });
      for (const a of admins) {
        await createNotificationWithOptions({
          userId: a.id,
          type: "LEAVE_COMPENSATION",
          message: `연차 만료 수당 검토: 직원 발생분 소멸(§61). userId=${row.userId}, 잔여 ${remaining.toFixed(2)}일`,
          link: "/admin/employee-leave-summary",
        });
      }
    }
  }

  return count;
}
