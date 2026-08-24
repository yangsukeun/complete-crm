import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import {
  canTeamLeadApprovePaymentRequest,
  fetchDepartmentsWithTeamLead,
  isCsTeamDepartment,
  paymentRequestNeedsExecutiveDirectApproval,
  paymentRequestNeedsExecutiveFirstLineApproval,
  teamLeadNotifyWhereForApplicantDepartment,
} from "@/lib/finance-payment-request-policy";
import {
  ensurePaymentRequestAlerts,
  notifyCenterChiefsOnCsTeamLeadApproval,
  notifyExecutivesOnTeamLeadApproval,
} from "@/lib/finance-payment-request-alerts";
import {
  financeScopePrismaWhere,
  getFinanceScope,
  isPaymentRequestInFinanceScope,
} from "@/lib/finance-scope";
import { getUserDepartments } from "@/lib/user-departments";
import { userHasPermission } from "@/lib/permissions";
import { resolveEffectivePermissionsJson } from "@/lib/permissions-resolve";

const createSchema = z.object({
  vendorId: z.string().min(1),
  amount: z.number().int().positive(),
  description: z.string().optional(),
  attachment: z.string().url().optional().or(z.literal("")),
  attachments: z.array(z.string().url()).optional(),
  quotationId: z.string().optional(),
});

function isTeamLead(role: string | undefined) {
  return role === "TEAM_LEAD";
}
function isCenterChief(role: string | undefined) {
  return role === "CENTER_CHIEF";
}
function isExecutive(role: string | undefined) {
  return role === "EXECUTIVE" || role === "ADMIN";
}

function getTransferExecutorIds(idsJson: string | null): string[] {
  if (!idsJson?.trim()) return [];
  try {
    const arr = JSON.parse(idsJson) as unknown;
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function normalizePaymentRequestAttachments(input: {
  attachment?: string | null;
  attachments?: unknown;
}): string[] {
  const fromJson = Array.isArray(input.attachments)
    ? input.attachments.filter((x): x is string => typeof x === "string")
    : [];
  const merged = [
    ...fromJson,
    ...(input.attachment && String(input.attachment).trim() ? [String(input.attachment).trim()] : []),
  ]
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
  return [...new Set(merged)];
}

export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    let role: string | undefined = session.user.role as string | undefined;
    try {
      const roleRows = await prisma.$queryRawUnsafe<{ role: string }[]>(
        'SELECT role FROM "User" WHERE id = $1',
        session.user.id
      );
      if (roleRows[0]) role = roleRows[0].role;
    } catch (_) {}
    const company = await prisma.companyInfo.findFirst({ orderBy: { updatedAt: "desc" } });
    // 회사 설정과 동일하게 raw로 읽어 이체 담당자 목록 확실히 반영
    let transferExecutorIds: string[] = [];
    if (company?.id) {
      const rows = await prisma.$queryRawUnsafe<{ transferExecutorIds: string | null }[]>(
        'SELECT "transferExecutorIds" FROM "CompanyInfo" WHERE id = $1',
        company.id
      );
      transferExecutorIds = getTransferExecutorIds(rows[0]?.transferExecutorIds ?? null);
    }
    const isTransferExecutor = transferExecutorIds.includes(session.user.id);

    const departmentsWithTeamLeadSet = await fetchDepartmentsWithTeamLead(prisma);
    const departmentsWithTeamLead = [...departmentsWithTeamLeadSet];
    const viewerRow = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { department: true, additionalDepartments: true },
    });
    const userDepartments = getUserDepartments({
      department: viewerRow?.department ?? null,
      additionalDepartments: viewerRow?.additionalDepartments ?? null,
    });
    const viewerDepartment = userDepartments.primary;
    const permsJson = await resolveEffectivePermissionsJson(session.user.id).catch(() => null);
    const hasFinanceView = userHasPermission(
      { role: role ?? "USER", permissions: permsJson },
      "finance_view"
    );
    const financeScope = getFinanceScope({
      userId: session.user.id,
      role,
      department: viewerDepartment,
      userDepartments,
      transferExecutorIds,
      hasFinanceView,
    });
    const listMeta = {
      departmentsWithTeamLead,
      viewerDepartment,
      financeScope: {
        kind: financeScope.kind,
        label: financeScope.label,
      },
    };

    const filterByScope = <T extends { requesterId?: string | null; requester?: { department?: string | null } | null }>(
      rows: T[]
    ): T[] => rows.filter((r) => isPaymentRequestInFinanceScope(financeScope, r));

    // 대표/임원: 전체 조회 후 완료/미완료로 분리 (다른 직원 요청 포함, 새/옛 건 구분 없음)
    if (isExecutive(role)) {
      const allRequests = await prisma.paymentRequest.findMany({
        where: {},
        include: {
          requester: { select: { id: true, name: true, email: true, position: true, department: true } },
          vendor: true,
          quotation: { select: { id: true, quotationNumber: true, title: true, finalAmount: true, clientName: true } },
        },
        orderBy: { requestedAt: "desc" },
      });
      let unreadCount = 0;
      try {
        const countRows = await prisma.$queryRawUnsafe<{ count: number }[]>(
          'SELECT COUNT(*) as count FROM "PaymentRequestAlert" WHERE "userId" = $1 AND "readAt" IS NULL',
          session.user.id
        );
        unreadCount = Number(countRows[0]?.count ?? 0);
      } catch (_) {}
      const completedRequests = allRequests
        .filter((r: any) => r.status === "COMPLETED")
        .sort((a: any, b: any) => (b.completedAt ? b.completedAt.getTime() : 0) - (a.completedAt ? a.completedAt.getTime() : 0));
      const pendingRequests = allRequests.filter(
        (r: any) =>
          r.status === "PENDING" ||
          r.status === "EXECUTIVE_PENDING" ||
          (isTransferExecutor && r.status === "TEAM_LEAD_APPROVED")
      );
      const mapWithAttachments = (r: any) => ({
        ...r,
        attachments: normalizePaymentRequestAttachments({ attachment: r.attachment ?? null, attachments: r.attachments }),
      });
      return NextResponse.json(
        {
          completedRequests: completedRequests.map(mapWithAttachments),
          pendingRequests: pendingRequests.map(mapWithAttachments),
          isExecutiveTransferExecutor: isTransferExecutor,
          transferExecutorIds,
          paymentAlertUnreadCount: unreadCount,
          ...listMeta,
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    // 팀장: 전체 목록 (raw SQL로 조회해 Prisma 오류 우회) + 미확인 알람 수
    if (isTeamLead(role)) {
      type Row = {
        id: string; status: string; amount: number; requestedAt: string; completedAt: string | null;
        description: string | null; attachment: string | null; attachments: any; requesterId: string; vendorId: string; quotationId: string | null;
        r_id: string; r_name: string; r_email: string; r_position: string | null; r_department: string | null;
        v_id: string; v_name: string; v_bankName: string; v_accountNumber: string; v_ownerName: string; v_category: string;
        q_id: string | null; q_quotationNumber: string | null; q_title: string | null; q_finalAmount: number | null; q_clientName: string | null;
      };
      const rawRows = await prisma.$queryRawUnsafe<Row[]>(
        `SELECT pr.id, pr.status, pr.amount, pr."requestedAt", pr."completedAt", pr.description, pr.attachment, pr.attachments, pr."requesterId", pr."vendorId", pr."quotationId",
         u.id as r_id, u.name as r_name, u.email as r_email, u.position as r_position, u.department as r_department,
         v.id as v_id, v.name as v_name, v."bankName" as v_bankName, v."accountNumber" as v_accountNumber, v."ownerName" as v_ownerName, v.category as v_category,
         q.id as q_id, q."quotationNumber" as q_quotationNumber, q.title as q_title, q."finalAmount" as q_finalAmount, q."clientName" as q_clientName
         FROM "PaymentRequest" pr
         LEFT JOIN "User" u ON pr."requesterId" = u.id
         LEFT JOIN "Vendor" v ON pr."vendorId" = v.id
         LEFT JOIN "Quotation" q ON pr."quotationId" = q.id
         ORDER BY pr."requestedAt" DESC`
      );
      const requests = rawRows.map((r: any) => ({
        id: r.id,
        status: r.status,
        amount: r.amount,
        requestedAt: r.requestedAt,
        completedAt: r.completedAt,
        description: r.description,
        attachment: r.attachment,
        attachments: normalizePaymentRequestAttachments({ attachment: r.attachment, attachments: r.attachments }),
        requesterId: r.requesterId,
        vendorId: r.vendorId,
        requester: {
          id: r.r_id,
          name: r.r_name,
          email: r.r_email,
          position: r.r_position,
          department: r.r_department,
        },
        vendor: { id: r.v_id, name: r.v_name, bankName: r.v_bankName, accountNumber: r.v_accountNumber, ownerName: r.v_ownerName, category: r.v_category },
        quotation: r.q_id
          ? { id: r.q_id, quotationNumber: r.q_quotationNumber ?? "", title: r.q_title ?? "", finalAmount: r.q_finalAmount ?? 0, clientName: r.q_clientName ?? "" }
          : null,
      }));
      const scopedRequests = filterByScope(requests);
      const pendingIds = scopedRequests
        .filter((r: any) => {
          if (r.status !== "PENDING") return false;
          if (
            paymentRequestNeedsExecutiveFirstLineApproval(
              r.requesterId,
              r.requester?.name,
              transferExecutorIds
            )
          ) {
            return false;
          }
          return canTeamLeadApprovePaymentRequest(
            viewerDepartment,
            r.requester?.department,
            departmentsWithTeamLeadSet
          );
        })
        .map((r: any) => r.id);
      const now = new Date().toISOString();
      const cuidLike = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
      if (pendingIds.length > 0) {
        try {
          const placeholders = pendingIds.map((_, i) => `$${i + 2}`).join(",");
          const existingRows = await prisma.$queryRawUnsafe<{ requestId: string }[]>(
            `SELECT "requestId" FROM "PaymentRequestAlert" WHERE "userId" = $1 AND "requestId" IN (${placeholders})`,
            session.user.id,
            ...pendingIds
          );
          const existingSet = new Set(existingRows.map((e: any) => e.requestId));
          for (const requestId of pendingIds) {
            if (existingSet.has(requestId)) continue;
            try {
              await prisma.$executeRawUnsafe(
                'INSERT INTO "PaymentRequestAlert" (id, "requestId", "userId", "createdAt") VALUES ($1, $2, $3, $4::timestamptz) ON CONFLICT ("requestId", "userId") DO NOTHING',
                cuidLike(),
                requestId,
                session.user.id,
                now
              );
            } catch (_) {}
          }
        } catch (e) {
          console.error("팀장 알람 보정 실패:", e);
        }
      }
      let finalUnread = 0;
      try {
        const countRows = await prisma.$queryRawUnsafe<{ count: number }[]>(
          'SELECT COUNT(*) as count FROM "PaymentRequestAlert" WHERE "userId" = $1 AND "readAt" IS NULL',
          session.user.id
        );
        finalUnread = Number(countRows[0]?.count ?? 0);
      } catch (_) {}
      return NextResponse.json(
        { requests: scopedRequests, paymentAlertUnreadCount: finalUnread, transferExecutorIds, ...listMeta },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    // 센터장(CS팀 2차): 부서 스코프 목록 + CS팀 CENTER_CHIEF_APPROVED 알람 보정
    if (isCenterChief(role)) {
      type Row = {
        id: string; status: string; amount: number; requestedAt: string; completedAt: string | null;
        description: string | null; attachment: string | null; attachments: any; requesterId: string; vendorId: string; quotationId: string | null;
        r_id: string; r_name: string; r_email: string; r_position: string | null; r_department: string | null;
        v_id: string; v_name: string; v_bankName: string; v_accountNumber: string; v_ownerName: string; v_category: string;
        q_id: string | null; q_quotationNumber: string | null; q_title: string | null; q_finalAmount: number | null; q_clientName: string | null;
      };
      const rawRows = await prisma.$queryRawUnsafe<Row[]>(
        `SELECT pr.id, pr.status, pr.amount, pr."requestedAt", pr."completedAt", pr.description, pr.attachment, pr.attachments, pr."requesterId", pr."vendorId", pr."quotationId",
         u.id as r_id, u.name as r_name, u.email as r_email, u.position as r_position, u.department as r_department,
         v.id as v_id, v.name as v_name, v."bankName" as v_bankName, v."accountNumber" as v_accountNumber, v."ownerName" as v_ownerName, v.category as v_category,
         q.id as q_id, q."quotationNumber" as q_quotationNumber, q.title as q_title, q."finalAmount" as q_finalAmount, q."clientName" as q_clientName
         FROM "PaymentRequest" pr
         LEFT JOIN "User" u ON pr."requesterId" = u.id
         LEFT JOIN "Vendor" v ON pr."vendorId" = v.id
         LEFT JOIN "Quotation" q ON pr."quotationId" = q.id
         ORDER BY pr."requestedAt" DESC`
      );
      const requests = rawRows.map((r: any) => ({
        id: r.id,
        status: r.status,
        amount: r.amount,
        requestedAt: r.requestedAt,
        completedAt: r.completedAt,
        description: r.description,
        attachment: r.attachment,
        attachments: normalizePaymentRequestAttachments({ attachment: r.attachment, attachments: r.attachments }),
        requesterId: r.requesterId,
        vendorId: r.vendorId,
        requester: {
          id: r.r_id,
          name: r.r_name,
          email: r.r_email,
          position: r.r_position,
          department: r.r_department,
        },
        vendor: { id: r.v_id, name: r.v_name, bankName: r.v_bankName, accountNumber: r.v_accountNumber, ownerName: r.v_ownerName, category: r.v_category },
        quotation: r.q_id
          ? { id: r.q_id, quotationNumber: r.q_quotationNumber ?? "", title: r.q_title ?? "", finalAmount: r.q_finalAmount ?? 0, clientName: r.q_clientName ?? "" }
          : null,
      }));
      const scopedRequests = filterByScope(requests);
      const pendingIds = scopedRequests
        .filter(
          (r: any) =>
            r.status === "CENTER_CHIEF_APPROVED" && isCsTeamDepartment(r.requester?.department)
        )
        .map((r: any) => r.id);
      const now = new Date().toISOString();
      const cuidLike = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
      if (pendingIds.length > 0) {
        try {
          const placeholders = pendingIds.map((_, i) => `$${i + 2}`).join(",");
          const existingRows = await prisma.$queryRawUnsafe<{ requestId: string }[]>(
            `SELECT "requestId" FROM "PaymentRequestAlert" WHERE "userId" = $1 AND "requestId" IN (${placeholders})`,
            session.user.id,
            ...pendingIds
          );
          const existingSet = new Set(existingRows.map((e: any) => e.requestId));
          for (const requestId of pendingIds) {
            if (existingSet.has(requestId)) continue;
            try {
              await prisma.$executeRawUnsafe(
                'INSERT INTO "PaymentRequestAlert" (id, "requestId", "userId", "createdAt") VALUES ($1, $2, $3, $4::timestamptz) ON CONFLICT ("requestId", "userId") DO NOTHING',
                cuidLike(),
                requestId,
                session.user.id,
                now
              );
            } catch (_) {}
          }
        } catch (e) {
          console.error("센터장 알람 보정 실패:", e);
        }
      }
      let finalUnread = 0;
      try {
        const countRows = await prisma.$queryRawUnsafe<{ count: number }[]>(
          'SELECT COUNT(*) as count FROM "PaymentRequestAlert" WHERE "userId" = $1 AND "readAt" IS NULL',
          session.user.id
        );
        finalUnread = Number(countRows[0]?.count ?? 0);
      } catch (_) {}
      return NextResponse.json(
        { requests: scopedRequests, paymentAlertUnreadCount: finalUnread, transferExecutorIds, ...listMeta },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    // 이체 담당자(일반/팀장 아님): 팀장과 동일하게 raw SQL로 전체 목록 조회 + 팀장 승인(이체대기) 건 알람 보정
    if (isTransferExecutor) {
      type Row = {
        id: string; status: string; amount: number; requestedAt: string; completedAt: string | null;
        description: string | null; attachment: string | null; attachments: any; requesterId: string; vendorId: string; quotationId: string | null;
        r_id: string; r_name: string; r_email: string; r_position: string | null; r_department: string | null;
        v_id: string; v_name: string; v_bankName: string; v_accountNumber: string; v_ownerName: string; v_category: string;
        q_id: string | null; q_quotationNumber: string | null; q_title: string | null; q_finalAmount: number | null; q_clientName: string | null;
      };
      const rawRows = await prisma.$queryRawUnsafe<Row[]>(
        `SELECT pr.id, pr.status, pr.amount, pr."requestedAt", pr."completedAt", pr.description, pr.attachment, pr.attachments, pr."requesterId", pr."vendorId", pr."quotationId",
         u.id as r_id, u.name as r_name, u.email as r_email, u.position as r_position, u.department as r_department,
         v.id as v_id, v.name as v_name, v."bankName" as v_bankName, v."accountNumber" as v_accountNumber, v."ownerName" as v_ownerName, v.category as v_category,
         q.id as q_id, q."quotationNumber" as q_quotationNumber, q.title as q_title, q."finalAmount" as q_finalAmount, q."clientName" as q_clientName
         FROM "PaymentRequest" pr
         LEFT JOIN "User" u ON pr."requesterId" = u.id
         LEFT JOIN "Vendor" v ON pr."vendorId" = v.id
         LEFT JOIN "Quotation" q ON pr."quotationId" = q.id
         ORDER BY pr."requestedAt" DESC`
      );
      const requests = rawRows.map((r: any) => ({
        id: r.id,
        status: r.status,
        amount: r.amount,
        requestedAt: r.requestedAt,
        completedAt: r.completedAt,
        description: r.description,
        attachment: r.attachment,
        attachments: normalizePaymentRequestAttachments({ attachment: r.attachment, attachments: r.attachments }),
        requesterId: r.requesterId,
        vendorId: r.vendorId,
        requester: {
          id: r.r_id,
          name: r.r_name,
          email: r.r_email,
          position: r.r_position,
          department: r.r_department,
        },
        vendor: { id: r.v_id, name: r.v_name, bankName: r.v_bankName, accountNumber: r.v_accountNumber, ownerName: r.v_ownerName, category: r.v_category },
        quotation: r.q_id
          ? { id: r.q_id, quotationNumber: r.q_quotationNumber ?? "", title: r.q_title ?? "", finalAmount: r.q_finalAmount ?? 0, clientName: r.q_clientName ?? "" }
          : null,
      }));
      const approvedIds = requests.filter((r: any) => r.status === "TEAM_LEAD_APPROVED").map((r: any) => r.id);
      if (approvedIds.length > 0) {
        const now = new Date().toISOString();
        const cuidLike = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
        try {
          const placeholders = approvedIds.map((_, i) => `$${i + 2}`).join(",");
          const existingRows = await prisma.$queryRawUnsafe<{ requestId: string }[]>(
            `SELECT "requestId" FROM "PaymentRequestAlert" WHERE "userId" = $1 AND "requestId" IN (${placeholders})`,
            session.user.id,
            ...approvedIds
          );
const existingSet = new Set(existingRows.map((e: any) => e.requestId));
      for (const requestId of approvedIds) {
            if (existingSet.has(requestId)) continue;
            try {
              await prisma.$executeRawUnsafe(
                'INSERT INTO "PaymentRequestAlert" (id, "requestId", "userId", "createdAt") VALUES ($1, $2, $3, $4::timestamptz) ON CONFLICT ("requestId", "userId") DO NOTHING',
                cuidLike(),
                requestId,
                session.user.id,
                now
              );
            } catch (_) {}
          }
        } catch (e) {
          console.error("이체 담당자 알람 보정 실패:", e);
        }
      }
      let unreadCount = 0;
      try {
        const countRows = await prisma.$queryRawUnsafe<{ count: number }[]>(
          'SELECT COUNT(*) as count FROM "PaymentRequestAlert" WHERE "userId" = $1 AND "readAt" IS NULL',
          session.user.id
        );
        unreadCount = Number(countRows[0]?.count ?? 0);
      } catch (_) {}
      return NextResponse.json(
        { requests, paymentAlertUnreadCount: unreadCount, transferExecutorIds, ...listMeta },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    // 비팀장 겸직+finance_view: 겸직 부서 건 ∪ 본인 건
    if (financeScope.kind === "SELF_AND_DEPARTMENTS") {
      const requests = await prisma.paymentRequest.findMany({
        where: financeScopePrismaWhere(financeScope) as any,
        include: {
          requester: {
            select: { id: true, name: true, email: true, position: true, department: true },
          },
          vendor: true,
          quotation: {
            select: { id: true, quotationNumber: true, title: true, finalAmount: true, clientName: true },
          },
        },
        orderBy: { requestedAt: "desc" },
      });
      const scoped = filterByScope(requests);
      const mapped = scoped.map((r: any) => ({
        ...r,
        attachments: normalizePaymentRequestAttachments({
          attachment: r.attachment ?? null,
          attachments: r.attachments,
        }),
      }));
      let paymentAlertUnreadCount = 0;
      try {
        const countRows = await prisma.$queryRawUnsafe<{ count: number }[]>(
          'SELECT COUNT(*) as count FROM "PaymentRequestAlert" WHERE "userId" = $1 AND "readAt" IS NULL',
          session.user.id
        );
        paymentAlertUnreadCount = Number(countRows[0]?.count ?? 0);
      } catch (_) {}
      return NextResponse.json({
        requests: mapped,
        paymentAlertUnreadCount,
        transferExecutorIds,
        ...listMeta,
      });
    }

    // 일반 직원(요청자): 본인 요청만 + 이체완료 알람 수
    const requests = await prisma.paymentRequest.findMany({
      where: { requesterId: session.user.id },
      include: {
        requester: {
          select: { id: true, name: true, email: true, position: true, department: true },
        },
        vendor: true,
        quotation: { select: { id: true, quotationNumber: true, title: true, finalAmount: true, clientName: true } },
      },
      orderBy: { requestedAt: "desc" },
    });
    const mapped = requests.map((r: any) => ({
      ...r,
      attachments: normalizePaymentRequestAttachments({ attachment: r.attachment ?? null, attachments: r.attachments }),
    }));
    let paymentAlertUnreadCount = 0;
    try {
      const countRows = await prisma.$queryRawUnsafe<{ count: number }[]>(
        'SELECT COUNT(*) as count FROM "PaymentRequestAlert" WHERE "userId" = $1 AND "readAt" IS NULL',
        session.user.id
      );
      paymentAlertUnreadCount = Number(countRows[0]?.count ?? 0);
    } catch (_) {}
    return NextResponse.json({ requests: mapped, paymentAlertUnreadCount, transferExecutorIds, ...listMeta });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "결제 요청 목록을 불러올 수 없습니다." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const vendor = await prisma.vendor.findUnique({
      where: { id: parsed.data.vendorId },
    });
    if (!vendor) {
      return NextResponse.json({ error: "거래처를 찾을 수 없습니다." }, { status: 404 });
    }

    const requesterUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, name: true, department: true },
    });
    const requesterRole = (requesterUser?.role ?? session.user.role) as string | undefined;

    const companyForPost = await prisma.companyInfo.findFirst({ orderBy: { updatedAt: "desc" } });
    let transferExecutorIdsPost: string[] = [];
    if (companyForPost?.id) {
      const teRows = await prisma.$queryRawUnsafe<{ transferExecutorIds: string | null }[]>(
        'SELECT "transferExecutorIds" FROM "CompanyInfo" WHERE id = $1',
        companyForPost.id
      );
      transferExecutorIdsPost = getTransferExecutorIds(teRows[0]?.transferExecutorIds ?? null);
    }

    const needsExecutiveFirstLine = paymentRequestNeedsExecutiveFirstLineApproval(
      session.user.id,
      requesterUser?.name,
      transferExecutorIdsPost
    );
    const isRequesterTeamLead = isTeamLead(requesterRole);
    const isRequesterCenterChief = isCenterChief(requesterRole);
    const requesterIsCs = isCsTeamDepartment(requesterUser?.department);
    const departmentsWithTeamLeadSet = await fetchDepartmentsWithTeamLead(prisma);
    const needsExecutiveDirect =
      !needsExecutiveFirstLine &&
      !isRequesterTeamLead &&
      !isRequesterCenterChief &&
      paymentRequestNeedsExecutiveDirectApproval(
        requesterUser?.department,
        departmentsWithTeamLeadSet
      );
    /**
     * 초기 상태:
     * - 이체담당자·김소윤: PENDING(대표 1차)
     * - CS팀장 신청: CENTER_CHIEF_APPROVED(센터장→대표)
     * - CS 센터장 신청: EXECUTIVE_PENDING(대표)
     * - 그 외 팀장 신청: TEAM_LEAD_APPROVED(이체대기) — 기존
     * - 일반: PENDING
     */
    let initialStatus:
      | "PENDING"
      | "CENTER_CHIEF_APPROVED"
      | "EXECUTIVE_PENDING"
      | "TEAM_LEAD_APPROVED" = "PENDING";
    if (needsExecutiveFirstLine) {
      initialStatus = "PENDING";
    } else if (requesterIsCs && isRequesterTeamLead) {
      initialStatus = "CENTER_CHIEF_APPROVED";
    } else if (requesterIsCs && isRequesterCenterChief) {
      initialStatus = "EXECUTIVE_PENDING";
    } else if (isRequesterTeamLead) {
      initialStatus = "TEAM_LEAD_APPROVED";
    }

    const normalizedAttachments = [
      ...(Array.isArray(parsed.data.attachments) ? parsed.data.attachments : []),
      ...(parsed.data.attachment && parsed.data.attachment !== "" ? [parsed.data.attachment] : []),
    ]
      .map((u) => String(u).trim())
      .filter((u) => u.length > 0);
    const uniqAttachments = [...new Set(normalizedAttachments)];

    const paymentRequest = await prisma.paymentRequest.create({
      data: {
        vendorId: parsed.data.vendorId,
        amount: parsed.data.amount,
        description: parsed.data.description || null,
        attachment: uniqAttachments[0] ?? null,
        attachments: uniqAttachments.length > 0 ? (uniqAttachments as any) : undefined,
        requesterId: session.user.id,
        quotationId: parsed.data.quotationId && parsed.data.quotationId !== "" ? parsed.data.quotationId : null,
        status: initialStatus,
      },
      include: {
        requester: {
          select: { id: true, name: true, email: true, position: true },
        },
        vendor: true,
        quotation: { select: { id: true, quotationNumber: true, title: true, finalAmount: true, clientName: true } },
      },
    });

    const now = new Date().toISOString();
    const cuidLike = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;

    if (needsExecutiveFirstLine) {
      // 이체 담당자·김소윤 요청: 대표/임원에게 알람 (없으면 팀장에게 폴백)
      try {
        const execs = await prisma.user.findMany({
          where: { role: { in: ["EXECUTIVE", "ADMIN"] } },
          select: { id: true },
        });
        const notifyIds = execs.length > 0 ? execs.map((u) => u.id) : (await prisma.user.findMany({ where: { role: "TEAM_LEAD" }, select: { id: true } })).map((u) => u.id);
        for (const userId of notifyIds) {
          try {
            await prisma.$executeRawUnsafe(
              'INSERT INTO "PaymentRequestAlert" (id, "requestId", "userId", "createdAt") VALUES ($1, $2, $3, $4::timestamptz) ON CONFLICT ("requestId", "userId") DO NOTHING',
              cuidLike(),
              paymentRequest.id,
              userId,
              now
            );
          } catch (_) {}
        }
      } catch (alertErr) {
        console.error("대표/임원 알람 생성 실패:", alertErr);
      }
    } else if (requesterIsCs && isRequesterTeamLead) {
      try {
        await notifyCenterChiefsOnCsTeamLeadApproval(paymentRequest.id);
      } catch (alertErr) {
        console.error("CS 센터장 알람 생성 실패:", alertErr);
      }
    } else if (requesterIsCs && isRequesterCenterChief) {
      try {
        await notifyExecutivesOnTeamLeadApproval(paymentRequest.id);
      } catch (alertErr) {
        console.error("대표/임원 알람 생성 실패:", alertErr);
      }
    } else if (isRequesterTeamLead) {
      // 팀장이 요청한 경우: 결제(이체) 담당자에게만 알람 등록
      try {
        for (const userId of transferExecutorIdsPost) {
          try {
            await prisma.$executeRawUnsafe(
              'INSERT INTO "PaymentRequestAlert" (id, "requestId", "userId", "createdAt") VALUES ($1, $2, $3, $4::timestamptz) ON CONFLICT ("requestId", "userId") DO NOTHING',
              cuidLike(),
              paymentRequest.id,
              userId,
              now
            );
          } catch (_) {}
        }
      } catch (alertErr) {
        console.error("이체 담당자 알람 생성 실패:", alertErr);
      }
    } else if (needsExecutiveDirect) {
      // 팀장 없는 부서: 대표/임원에게 바로 알람
      try {
        await notifyExecutivesOnTeamLeadApproval(paymentRequest.id);
      } catch (alertErr) {
        console.error("대표/임원 알람 생성 실패:", alertErr);
      }
    } else {
      // 일반 직원 요청: 신청자와 같은 부서 팀장에게만 알람
      try {
        const teamLeadWhere = teamLeadNotifyWhereForApplicantDepartment(requesterUser?.department);
        if (teamLeadWhere) {
          const teamLeads = await prisma.user.findMany({
            where: teamLeadWhere,
            select: { id: true },
          });
          await ensurePaymentRequestAlerts(
            paymentRequest.id,
            teamLeads.map((u) => u.id)
          );
        }
      } catch (alertErr) {
        console.error("팀장 알람 생성 실패:", alertErr);
      }
    }

    return NextResponse.json(paymentRequest);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "결제 요청에 실패했습니다." }, { status: 500 });
  }
}
