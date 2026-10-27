import {resolveFinanceAccess,redactPaymentBank} from "@/lib/finance-access";
import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import {

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

  isPaymentRequestInFinanceScope,
} from "@/lib/finance-scope";
import { canCreatePaymentRequest } from "@/lib/permissions";
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
 const session=await getAppSession();if(!session?.user?.id)return NextResponse.json({error:'Unauthorized'},{status:401});
 const {scope,role,transferExecutorIds}=await resolveFinanceAccess(session.user.id);
 const rows=await prisma.paymentRequest.findMany({where:financeScopePrismaWhere(scope),include:{requester:{select:{id:true,name:true,position:true,department:true}},vendor:true,quotation:{select:{id:true,quotationNumber:true,title:true,finalAmount:true,clientName:true}}},orderBy:{requestedAt:'desc'}});
 const requests=rows.filter(row=>isPaymentRequestInFinanceScope(scope,row)).map(row=>({...redactPaymentBank(row,scope),attachments:normalizePaymentRequestAttachments({attachment:row.attachment??null,attachments:row.attachments})}));
 const paymentAlertUnreadCount=await prisma.paymentRequestAlert.count({where:{userId:session.user.id,readAt:null,request:{...financeScopePrismaWhere(scope)}}});
 const departmentsWithTeamLead=Array.from(await fetchDepartmentsWithTeamLead(prisma));
 const metadata={viewerDepartment:scope.department,departmentsWithTeamLead,requests,transferExecutorIds,paymentAlertUnreadCount,financeScope:{kind:scope.kind,label:scope.label},isTransferExecutor:scope.isTransferExecutor};
 return NextResponse.json(isExecutive(role)?{...metadata,completedRequests:requests.filter(r=>r.status==='COMPLETED'),pendingRequests:requests.filter(r=>r.status!=='COMPLETED'&&r.status!=='REJECTED'),isExecutiveTransferExecutor:scope.isTransferExecutor}:metadata,{headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
 }catch {return NextResponse.json({error:'지출 조회 권한 또는 저장소를 확인할 수 없습니다.'},{status:403});}
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await resolveFinanceAccess(session.user.id);
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
    const permsJson = await resolveEffectivePermissionsJson(session.user.id).catch(() => null);
    if (!canCreatePaymentRequest({ role: requesterRole, permissions: permsJson })) {
      return NextResponse.json({ error: "자금 요청 권한이 없습니다." }, { status: 403 });
    }

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
        attachments: uniqAttachments.length > 0 ? uniqAttachments : undefined,
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


    if (needsExecutiveFirstLine) {
      // 이체 담당자·김소윤 요청: 대표/임원에게 알람 (없으면 팀장에게 폴백)
      try {
        const execs = await prisma.user.findMany({
          where: { role: { in: ["EXECUTIVE", "ADMIN"] } },
          select: { id: true },
        });
        const notifyIds = execs.length > 0 ? execs.map((u) => u.id) : (await prisma.user.findMany({ where: { role: "TEAM_LEAD" }, select: { id: true } })).map((u) => u.id);
        await ensurePaymentRequestAlerts(paymentRequest.id, notifyIds);
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
        await ensurePaymentRequestAlerts(paymentRequest.id, transferExecutorIdsPost);
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

    return NextResponse.json(redactPaymentBank(paymentRequest,(await resolveFinanceAccess(session.user.id)).scope));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "결제 요청에 실패했습니다." }, { status: 500 });
  }
}
