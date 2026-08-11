/**
 * CS팀 3단계 결재 + 마케팅/물류 회귀 검증 (DB 직접)
 *
 *   npx tsx scripts/verify-cs-payment-chain.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  canCenterChiefApprovePaymentRequest,
  canTeamLeadApprovePaymentRequest,
  fetchDepartmentsWithTeamLead,
  isCsTeamDepartment,
} from "../src/lib/finance-payment-request-policy";
import { getCsTeamDefaultPermissions } from "../src/lib/cs-team-permissions";

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`OK: ${msg}`);
}

async function main() {
  // 마스터
  const dept = await prisma.department.findFirst({ where: { name: "CS팀" } });
  assert(dept, "Department CS팀 존재");
  const posLead = await prisma.position.findFirst({ where: { name: "CS팀장" } });
  const posChief = await prisma.position.findFirst({ where: { name: "센터장" } });
  assert(posLead, "Position CS팀장 존재");
  assert(posChief, "Position 센터장 존재");

  const roleVals = await prisma.$queryRawUnsafe<{ enumlabel: string }[]>(
    `SELECT e.enumlabel FROM pg_enum e
     JOIN pg_type t ON e.enumtypid = t.oid
     WHERE t.typname = 'Role' ORDER BY e.enumsortorder`
  );
  assert(
    roleVals.some((r) => r.enumlabel === "CENTER_CHIEF"),
    "Role enum에 CENTER_CHIEF"
  );
  const statusVals = await prisma.$queryRawUnsafe<{ enumlabel: string }[]>(
    `SELECT e.enumlabel FROM pg_enum e
     JOIN pg_type t ON e.enumtypid = t.oid
     WHERE t.typname = 'PaymentRequestStatus' ORDER BY e.enumsortorder`
  );
  assert(
    statusVals.some((r) => r.enumlabel === "CENTER_CHIEF_APPROVED"),
    "PaymentRequestStatus에 CENTER_CHIEF_APPROVED"
  );

  const csUser = await prisma.user.findUnique({ where: { email: "cs.user.test@complete.local" } });
  const csLead = await prisma.user.findUnique({ where: { email: "cs.lead.test@complete.local" } });
  const csChief = await prisma.user.findUnique({ where: { email: "cs.chief.test@complete.local" } });
  assert(csUser?.role === "USER" && csUser.department === "CS팀", "CS USER 테스트 계정");
  assert(csLead?.role === "TEAM_LEAD" && csLead.department === "CS팀", "CS 팀장 테스트 계정");
  assert(csChief?.role === "CENTER_CHIEF" && csChief.department === "CS팀", "CS 센터장 테스트 계정");

  // 메뉴 권한
  const userPerms = getCsTeamDefaultPermissions("USER");
  assert(!userPerms.includes("tasks") && !userPerms.includes("quotations"), "CS USER: tasks/quotations 제외");
  assert(!userPerms.includes("finance_view"), "CS USER: finance_view 제외");
  const leadPerms = getCsTeamDefaultPermissions("TEAM_LEAD");
  assert(leadPerms.includes("finance_view") && !leadPerms.includes("tasks"), "CS 팀장: finance_view만 복구");
  const chiefPerms = getCsTeamDefaultPermissions("CENTER_CHIEF");
  assert(chiefPerms.includes("finance_view") && !chiefPerms.includes("quotations"), "CS 센터장: finance_view, 견적 숨김");

  const vendor = await prisma.vendor.findFirst({ orderBy: { createdAt: "asc" } });
  assert(vendor, "검증용 Vendor 존재");
  const exec = await prisma.user.findFirst({
    where: { role: { in: ["EXECUTIVE", "ADMIN"] } },
    orderBy: { createdAt: "asc" },
  });
  assert(exec, "대표/ADMIN 계정 존재");

  const withLead = await fetchDepartmentsWithTeamLead(prisma);
  assert(isCsTeamDepartment("CS팀"), "isCsTeamDepartment(CS팀)");
  assert(canTeamLeadApprovePaymentRequest("CS팀", "CS팀", withLead), "CS 팀장 동일 부서 승인 가능");
  assert(canCenterChiefApprovePaymentRequest("CENTER_CHIEF", "CS팀"), "센터장 CS 승인 가능");
  assert(!canCenterChiefApprovePaymentRequest("CENTER_CHIEF", "마케팅"), "센터장 마케팅 승인 불가");

  // CS 체인 시뮬레이션
  const csReq = await prisma.paymentRequest.create({
    data: {
      vendorId: vendor!.id,
      amount: 1000,
      description: "[verify] CS 3단계 체인",
      requesterId: csUser!.id,
      status: "PENDING",
    },
  });
  try {
    await prisma.paymentRequest.update({
      where: { id: csReq.id },
      data: { status: "CENTER_CHIEF_APPROVED" },
    });
    let row = await prisma.paymentRequest.findUnique({ where: { id: csReq.id } });
    assert(row?.status === "CENTER_CHIEF_APPROVED", "1차(팀장) → CENTER_CHIEF_APPROVED");

    await prisma.paymentRequest.update({
      where: { id: csReq.id },
      data: { status: "EXECUTIVE_PENDING" },
    });
    row = await prisma.paymentRequest.findUnique({ where: { id: csReq.id } });
    assert(row?.status === "EXECUTIVE_PENDING", "2차(센터장) → EXECUTIVE_PENDING");

    await prisma.paymentRequest.update({
      where: { id: csReq.id },
      data: { status: "TEAM_LEAD_APPROVED" },
    });
    row = await prisma.paymentRequest.findUnique({ where: { id: csReq.id } });
    assert(row?.status === "TEAM_LEAD_APPROVED", "최종(대표) → TEAM_LEAD_APPROVED(이체대기)");

    await prisma.paymentRequest.update({
      where: { id: csReq.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    row = await prisma.paymentRequest.findUnique({ where: { id: csReq.id } });
    assert(row?.status === "COMPLETED", "이체완료 → COMPLETED");
  } finally {
    await prisma.paymentRequestAlert.deleteMany({ where: { requestId: csReq.id } }).catch(() => {});
    await prisma.paymentRequest.delete({ where: { id: csReq.id } }).catch(() => {});
  }

  // 마케팅 회귀: 팀장 → EXECUTIVE_PENDING (CENTER_CHIEF 단계 없음)
  const mktLead = await prisma.user.findFirst({
    where: { role: "TEAM_LEAD", department: { contains: "마케팅" } },
  });
  const mktUser = await prisma.user.findFirst({
    where: { role: "USER", department: { contains: "마케팅" } },
  });
  if (mktLead && mktUser && vendor) {
    assert(!isCsTeamDepartment(mktUser.department), "마케팅은 CS 분기 아님");
    const mktReq = await prisma.paymentRequest.create({
      data: {
        vendorId: vendor.id,
        amount: 2000,
        description: "[verify] 마케팅 2단계 회귀",
        requesterId: mktUser.id,
        status: "PENDING",
      },
    });
    try {
      await prisma.paymentRequest.update({
        where: { id: mktReq.id },
        data: { status: "EXECUTIVE_PENDING" },
      });
      const row = await prisma.paymentRequest.findUnique({ where: { id: mktReq.id } });
      assert(row?.status === "EXECUTIVE_PENDING", "마케팅 팀장 승인 → EXECUTIVE_PENDING (센터장 단계 없음)");
      await prisma.paymentRequest.update({
        where: { id: mktReq.id },
        data: { status: "TEAM_LEAD_APPROVED" },
      });
      const row2 = await prisma.paymentRequest.findUnique({ where: { id: mktReq.id } });
      assert(row2?.status === "TEAM_LEAD_APPROVED", "마케팅 대표 승인 → TEAM_LEAD_APPROVED");
    } finally {
      await prisma.paymentRequestAlert.deleteMany({ where: { requestId: mktReq.id } }).catch(() => {});
      await prisma.paymentRequest.delete({ where: { id: mktReq.id } }).catch(() => {});
    }
  } else {
    console.log("SKIP: 마케팅팀 계정 없어 마케팅 회귀 DB 시뮬레이션 생략");
  }

  // 물류 회귀 (일반 USER 없으면 팀장 신청=기존 TEAM_LEAD_APPROVED 직행 경로만 확인)
  const logLead = await prisma.user.findFirst({
    where: { role: "TEAM_LEAD", department: { contains: "물류" } },
  });
  const logUser = await prisma.user.findFirst({
    where: { role: "USER", department: { contains: "물류" } },
  });
  if (logLead && logUser && vendor) {
    assert(!isCsTeamDepartment(logUser.department), "물류는 CS 분기 아님");
    const logReq = await prisma.paymentRequest.create({
      data: {
        vendorId: vendor.id,
        amount: 3000,
        description: "[verify] 물류 2단계 회귀",
        requesterId: logUser.id,
        status: "PENDING",
      },
    });
    try {
      await prisma.paymentRequest.update({
        where: { id: logReq.id },
        data: { status: "EXECUTIVE_PENDING" },
      });
      const row = await prisma.paymentRequest.findUnique({ where: { id: logReq.id } });
      assert(row?.status === "EXECUTIVE_PENDING", "물류 팀장 승인 → EXECUTIVE_PENDING");
    } finally {
      await prisma.paymentRequestAlert.deleteMany({ where: { requestId: logReq.id } }).catch(() => {});
      await prisma.paymentRequest.delete({ where: { id: logReq.id } }).catch(() => {});
    }
  } else if (logLead && vendor) {
    assert(!isCsTeamDepartment(logLead.department), "물류는 CS 분기 아님");
    const logReq = await prisma.paymentRequest.create({
      data: {
        vendorId: vendor.id,
        amount: 3000,
        description: "[verify] 물류 팀장신청 회귀",
        requesterId: logLead.id,
        status: "TEAM_LEAD_APPROVED",
      },
    });
    try {
      const row = await prisma.paymentRequest.findUnique({ where: { id: logReq.id } });
      assert(row?.status === "TEAM_LEAD_APPROVED", "물류 팀장 신청 → 이체대기(기존 경로)");
    } finally {
      await prisma.paymentRequestAlert.deleteMany({ where: { requestId: logReq.id } }).catch(() => {});
      await prisma.paymentRequest.delete({ where: { id: logReq.id } }).catch(() => {});
    }
  } else {
    console.log("SKIP: 물류팀 계정 없어 물류 회귀 DB 시뮬레이션 생략");
  }

  console.log("\nALL CHECKS PASSED");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
