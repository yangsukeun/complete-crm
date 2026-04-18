import prisma from "@/lib/prisma";

/** NotificationLog.kind — DB 문자열과 Cron 스펙 정합 */
export type NotificationLogKind =
  | "ORPHAN"
  | "STALE"
  | "DUE_D3"
  | "DUE_D1"
  | "DUE_DAY"
  | "DIGEST";

/** 동일 업무·종류의 로그가 since 이후 존재하면 true (중복 발송 방지) */
export async function hasTaskNotificationLog(
  taskId: string,
  kind: NotificationLogKind,
  since: Date
): Promise<boolean> {
  const n = await prisma.notificationLog.count({
    where: { taskId, kind, sentAt: { gte: since } },
  });
  return n > 0;
}

/** 동일 유저·DIGEST·since 이후 발송 여부 (KST 일 시작 시각을 since로 넘기면 하루 1회) */
export async function hasDigestSince(userId: string, since: Date): Promise<boolean> {
  const n = await prisma.notificationLog.count({
    where: { userId, kind: "DIGEST", sentAt: { gte: since } },
  });
  return n > 0;
}

export async function insertNotificationLogs(
  rows: { userId: string; taskId?: string | null; kind: NotificationLogKind }[]
): Promise<void> {
  if (rows.length === 0) return;
  await prisma.notificationLog.createMany({
    data: rows.map((r) => ({
      userId: r.userId,
      taskId: r.taskId ?? null,
      kind: r.kind,
    })),
  });
}
