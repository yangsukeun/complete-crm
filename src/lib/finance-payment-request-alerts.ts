import prisma from "@/lib/prisma";

export function parseTransferExecutorIds(idsJson: string | null | undefined): string[] {
  if (!idsJson?.trim()) return [];
  try {
    const arr = JSON.parse(idsJson) as unknown;
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
  } catch {
    return [];
  }
}

function cuidLike() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
}

/** 회사 설정에서 이체 담당자 ID 목록 (raw SQL — Prisma 필드 누락·배포 스키마 지연 대비) */
export async function loadTransferExecutorIds(): Promise<string[]> {
  const company = await prisma.companyInfo.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (!company?.id) return [];
  try {
    const rows = await prisma.$queryRawUnsafe<{ transferExecutorIds: string | null }[]>(
      'SELECT "transferExecutorIds" FROM "CompanyInfo" WHERE id = $1',
      company.id
    );
    return parseTransferExecutorIds(rows[0]?.transferExecutorIds ?? null);
  } catch (err) {
    console.error("[finance] loadTransferExecutorIds failed", err);
    return [];
  }
}

/** 이체 담당자·요청자 등에게 PaymentRequestAlert 생성 (중복 무시) */
export async function ensurePaymentRequestAlerts(
  requestId: string,
  userIds: readonly string[]
): Promise<void> {
  const unique = [...new Set(userIds.filter((id) => typeof id === "string" && id.length > 0))];
  if (unique.length === 0) return;

  const now = new Date().toISOString();
  for (const userId of unique) {
    try {
      await prisma.$executeRawUnsafe(
        'INSERT INTO "PaymentRequestAlert" (id, "requestId", "userId", "createdAt") VALUES ($1, $2, $3, $4::timestamptz) ON CONFLICT ("requestId", "userId") DO NOTHING',
        cuidLike(),
        requestId,
        userId,
        now
      );
    } catch (err) {
      console.error("[finance] ensurePaymentRequestAlerts failed", { requestId, userId, err });
    }
  }
}

/** 1차 승인(이체대기) 시 이체 담당자 전원에게 알람 */
export async function notifyTransferExecutorsOnApproval(requestId: string): Promise<void> {
  const transferExecutorIds = await loadTransferExecutorIds();
  await ensurePaymentRequestAlerts(requestId, transferExecutorIds);
}

/** 팀장 1차 승인 후 대표/임원에게 2차 승인 알람 */
export async function notifyExecutivesOnTeamLeadApproval(requestId: string): Promise<void> {
  const execs = await prisma.user.findMany({
    where: { role: { in: ["EXECUTIVE", "ADMIN"] } },
    select: { id: true },
  });
  await ensurePaymentRequestAlerts(
    requestId,
    execs.map((u) => u.id)
  );
}
