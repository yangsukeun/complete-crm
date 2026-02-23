import { startOfDay, addDays } from "date-fns";
import prisma from "@/lib/prisma";

/**
 * 요청 헤더에서 클라이언트 IP 추출
 * - x-forwarded-for: 프록시/로드밸런서 뒤에서 실제 클라이언트 IP (쉼표 구분 시 첫 값이 클라이언트)
 * - x-real-ip: Nginx 등에서 설정하는 실제 IP
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

/**
 * 해당 사용자의 "오늘(00:00~23:59)" LOGIN 타입 AccessLog가 이미 있으면 무시,
 * 없으면 한 건 생성 (하루 최초 접속만 기록)
 */
export async function ensureAccessLog(
  userId: string,
  ipAddress: string,
  userAgent: string
): Promise<void> {
  if (!(prisma as { accessLog?: unknown }).accessLog) return;

  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = addDays(dayStart, 1);

  const existing = await prisma.accessLog.findFirst({
    where: {
      userId,
      type: "LOGIN",
      loggedInAt: {
        gte: dayStart,
        lt: dayEnd,
      },
    },
  });

  if (existing) return;

  await prisma.accessLog.create({
    data: {
      userId,
      ipAddress: ipAddress || "unknown",
      userAgent: userAgent || "",
      type: "LOGIN",
    },
  });

  const { createActivityLog } = await import("@/lib/activity-log");
  await createActivityLog(userId, "LOGIN", "로그인");
}
