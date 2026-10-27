import {WORKSPACE_OWNER} from "./workspace-areas";
import {isPaymentRequestInFinanceScope} from "./finance-scope";
import prisma from "@/lib/prisma";
import { createNotificationWithOptions } from "@/lib/notifications";

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

/** 요청의 현재 상태에 맞는 알림 문구 */
async function buildPaymentAlertMessage(requestId: string): Promise<string | null> {
  const r = await prisma.paymentRequest.findUnique({
    where: { id: requestId },
    select: { amount: true, status: true, vendor: { select: { name: true } }, requester: { select: { name: true } } },
  });
  if (!r) return null;
  const what = `${r.vendor?.name ?? "거래처"} ${r.amount.toLocaleString("ko-KR")}원`;
  const who = r.requester?.name ? `${r.requester.name}님의 ` : "";
  switch (r.status) {
    case "TEAM_LEAD_APPROVED":
      return `자금 이체가 승인되었습니다: ${what}. 이체를 진행해 주세요.`;
    case "COMPLETED":
      return `요청하신 자금 이체가 완료되었습니다: ${what}`;
    case "REJECTED":
      return `자금 이체 요청이 반려되었습니다: ${what}`;
    default:
      return `${who}자금 이체 요청이 있습니다: ${what}. 승인해 주세요.`;
  }
}

/**
 * 이체 담당자·요청자 등에게 PaymentRequestAlert 생성 (중복 무시)
 * 새로 생긴 알람은 재무 화면 배지뿐 아니라 종 알림·푸시로도 보낸다(전에는 배지만 있어 놓치기 쉬웠다).
 */
export async function ensurePaymentRequestAlerts(
  requestId: string,
  userIds: readonly string[]
): Promise<void> {
  const unique = [...new Set(userIds.filter((id) => typeof id === "string" && id.length > 0))];
  if (unique.length === 0) return;

  const request=await prisma.paymentRequest.findUnique({where:{id:requestId},select:{requesterId:true,requester:{select:{department:true}}}});
  if(!request)return;
  const {resolveFinanceAccess}=await import("./finance-access");
  const now = new Date().toISOString();
  const inserted: string[] = [];
  for (const userId of unique) {
    try {
      const {scope}=await resolveFinanceAccess(userId);
      if(!isPaymentRequestInFinanceScope(scope,request))continue;
      const count = await prisma.$executeRawUnsafe(
        'INSERT INTO "PaymentRequestAlert" (id, "requestId", "userId", "createdAt") VALUES ($1, $2, $3, $4::timestamptz) ON CONFLICT ("requestId", "userId") DO NOTHING',
        cuidLike(),
        requestId,
        userId,
        now
      );
      if (count > 0) inserted.push(userId);
    } catch (err) {
      console.error("[finance] ensurePaymentRequestAlerts failed", { requestId, userId, err });
    }
  }
  if (inserted.length === 0) return;

  try {
    const message = await buildPaymentAlertMessage(requestId);
    if (!message) return;
    await Promise.allSettled(
      inserted.map((userId) =>
        createNotificationWithOptions({
          userId,
          type: "PAYMENT_REQUEST",
          message,
          link: "/finance/requests",
          pushTitle: "자금 이체",
        })
      )
    );
  } catch (err) {
    console.error("[finance] payment notification failed", { requestId, err });
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

/** CS팀 팀장 1차 후 센터장에게 알람 */
export async function notifyCenterChiefsOnCsTeamLeadApproval(requestId: string): Promise<void> {
  const chiefs = await prisma.user.findMany({
    where: { role: "CENTER_CHIEF", department: "CS팀" },
    select: { id: true },
  });
  await ensurePaymentRequestAlerts(
    requestId,
    chiefs.map((u) => u.id)
  );
}

/**
 * 이체 담당자·대표가 승인된(이체 대기) 요청을 삭제했을 때
 * 요청자와 대표 전원(삭제한 사람 제외)에게 사유를 담아 알린다.
 * 요청 행은 이미 지워졌으므로 PaymentRequestAlert 없이 종 알림·푸시로만 보낸다.
 */
export async function notifyPaymentRequestDeleted(input: {
  actorId: string;
  requesterId: string | null;
  vendorName: string | null;
  amount: number;
  reason: string;
}): Promise<void> {
  const [actor, execs] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.actorId }, select: { name: true } }),
    prisma.user.findMany({ where: { role: { in: ["EXECUTIVE", "ADMIN"] } }, select: { id: true } }),
  ]);
  const recipients = new Set(execs.filter(u=>u.id===WORKSPACE_OWNER).map((u) => u.id));
  if (input.requesterId) recipients.add(input.requesterId);
  recipients.delete(input.actorId);
  if (recipients.size === 0) return;

  const what = `${input.vendorName ?? "거래처"} ${input.amount.toLocaleString("ko-KR")}원`;
  const message = `${actor?.name ?? "이체 담당자"}님이 승인된 자금 이체 요청을 삭제했습니다: ${what} (사유: ${input.reason})`;
  await Promise.allSettled(
    [...recipients].map((userId) =>
      createNotificationWithOptions({
        userId,
        type: "PAYMENT_REQUEST",
        message,
        link: "/finance/requests",
        pushTitle: "자금 이체 삭제",
      })
    )
  );
}
