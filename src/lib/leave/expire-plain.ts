import prisma from "@/lib/prisma";
import { startOfKstDay } from "@/lib/leave/kst-date";

/** 만료 도래분 단순 소멸 (수당·알림 없음). isExpired / expiredAt 만 갱신. */
export async function markExpiredAccrualsPlain(asOf: Date = new Date()): Promise<number> {
  const boundary = startOfKstDay(asOf);
  const result = await prisma.leaveAccrual.updateMany({
    where: {
      isExpired: false,
      expiresAt: { lte: boundary },
    },
    data: {
      isExpired: true,
      expiredAt: boundary,
    },
  });
  return result.count;
}
