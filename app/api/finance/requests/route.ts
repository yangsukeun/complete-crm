import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { paymentRequestNeedsExecutiveFirstLineApproval } from "@/lib/finance-payment-request-policy";

const createSchema = z.object({
  vendorId: z.string().min(1),
  amount: z.number().int().positive(),
  description: z.string().optional(),
  attachment: z.string().url().optional().or(z.literal("")),
  quotationId: z.string().optional(),
});

function isTeamLead(role: string | undefined) {
  return role === "TEAM_LEAD";
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

    // 대표/임원: 전체 조회 후 완료/미완료로 분리 (다른 직원 요청 포함, 새/옛 건 구분 없음)
    if (isExecutive(role)) {
      const allRequests = await prisma.paymentRequest.findMany({
        where: {},
        include: {
          requester: { select: { id: true, name: true, email: true, position: true } },
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
        (r: any) => r.status === "PENDING" || r.status === "TEAM_LEAD_APPROVED"
      );
      return NextResponse.json(
        {
          completedRequests,
          pendingRequests,
          isExecutiveTransferExecutor: isTransferExecutor,
          transferExecutorIds,
          paymentAlertUnreadCount: unreadCount,
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    // 팀장: 전체 목록 (raw SQL로 조회해 Prisma 오류 우회) + 미확인 알람 수
    if (isTeamLead(role)) {
      type Row = {
        id: string; status: string; amount: number; requestedAt: string; completedAt: string | null;
        description: string | null; attachment: string | null; requesterId: string; vendorId: string; quotationId: string | null;
        r_id: string; r_name: string; r_email: string; r_position: string | null;
        v_id: string; v_name: string; v_bankName: string; v_accountNumber: string; v_ownerName: string; v_category: string;
        q_id: string | null; q_quotationNumber: string | null; q_title: string | null; q_finalAmount: number | null; q_clientName: string | null;
      };
      const rawRows = await prisma.$queryRawUnsafe<Row[]>(
        `SELECT pr.id, pr.status, pr.amount, pr."requestedAt", pr."completedAt", pr.description, pr.attachment, pr."requesterId", pr."vendorId", pr."quotationId",
         u.id as r_id, u.name as r_name, u.email as r_email, u.position as r_position,
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
        requesterId: r.requesterId,
        vendorId: r.vendorId,
        requester: { id: r.r_id, name: r.r_name, email: r.r_email, position: r.r_position },
        vendor: { id: r.v_id, name: r.v_name, bankName: r.v_bankName, accountNumber: r.v_accountNumber, ownerName: r.v_ownerName, category: r.v_category },
        quotation: r.q_id
          ? { id: r.q_id, quotationNumber: r.q_quotationNumber ?? "", title: r.q_title ?? "", finalAmount: r.q_finalAmount ?? 0, clientName: r.q_clientName ?? "" }
          : null,
      }));
      const pendingIds = requests.filter((r: any) => r.status === "PENDING").map((r: any) => r.id);
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
        { requests, paymentAlertUnreadCount: finalUnread, transferExecutorIds },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    // 이체 담당자(일반/팀장 아님): 팀장과 동일하게 raw SQL로 전체 목록 조회 + 팀장 승인(이체대기) 건 알람 보정
    if (isTransferExecutor) {
      type Row = {
        id: string; status: string; amount: number; requestedAt: string; completedAt: string | null;
        description: string | null; attachment: string | null; requesterId: string; vendorId: string; quotationId: string | null;
        r_id: string; r_name: string; r_email: string; r_position: string | null;
        v_id: string; v_name: string; v_bankName: string; v_accountNumber: string; v_ownerName: string; v_category: string;
        q_id: string | null; q_quotationNumber: string | null; q_title: string | null; q_finalAmount: number | null; q_clientName: string | null;
      };
      const rawRows = await prisma.$queryRawUnsafe<Row[]>(
        `SELECT pr.id, pr.status, pr.amount, pr."requestedAt", pr."completedAt", pr.description, pr.attachment, pr."requesterId", pr."vendorId", pr."quotationId",
         u.id as r_id, u.name as r_name, u.email as r_email, u.position as r_position,
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
        requesterId: r.requesterId,
        vendorId: r.vendorId,
        requester: { id: r.r_id, name: r.r_name, email: r.r_email, position: r.r_position },
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
        { requests, paymentAlertUnreadCount: unreadCount, transferExecutorIds },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    // 일반 직원(요청자): 본인 요청만 + 이체완료 알람 수
    const requests = await prisma.paymentRequest.findMany({
      where: { requesterId: session.user.id },
      include: {
        requester: {
          select: { id: true, name: true, email: true, position: true },
        },
        vendor: true,
        quotation: { select: { id: true, quotationNumber: true, title: true, finalAmount: true, clientName: true } },
      },
      orderBy: { requestedAt: "desc" },
    });
    let paymentAlertUnreadCount = 0;
    try {
      const countRows = await prisma.$queryRawUnsafe<{ count: number }[]>(
        'SELECT COUNT(*) as count FROM "PaymentRequestAlert" WHERE "userId" = $1 AND "readAt" IS NULL',
        session.user.id
      );
      paymentAlertUnreadCount = Number(countRows[0]?.count ?? 0);
    } catch (_) {}
    return NextResponse.json({ requests, paymentAlertUnreadCount, transferExecutorIds });
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
      select: { role: true, name: true },
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
    /** 이체 담당자·김소윤: 팀장 자동승인 없음 → 대표/임원·팀장이 1차 승인 */
    const initialStatus =
      needsExecutiveFirstLine ? "PENDING" : isRequesterTeamLead ? "TEAM_LEAD_APPROVED" : "PENDING";

    const paymentRequest = await prisma.paymentRequest.create({
      data: {
        vendorId: parsed.data.vendorId,
        amount: parsed.data.amount,
        description: parsed.data.description || null,
        attachment: parsed.data.attachment && parsed.data.attachment !== "" ? parsed.data.attachment : null,
        requesterId: session.user.id,
        quotationId: parsed.data.quotationId && parsed.data.quotationId !== "" ? parsed.data.quotationId : null,
        status: initialStatus as "PENDING" | "TEAM_LEAD_APPROVED",
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
    } else {
      // 일반 직원 요청: 결재 담당자(팀장)에게 알람 등록
      try {
        const teamLeads = await prisma.user.findMany({
          where: { role: "TEAM_LEAD" },
          select: { id: true },
        });
        for (const u of teamLeads) {
          try {
            await prisma.$executeRawUnsafe(
              'INSERT INTO "PaymentRequestAlert" (id, "requestId", "userId", "createdAt") VALUES ($1, $2, $3, $4::timestamptz) ON CONFLICT ("requestId", "userId") DO NOTHING',
              cuidLike(),
              paymentRequest.id,
              u.id,
              now
            );
          } catch (_) {}
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
