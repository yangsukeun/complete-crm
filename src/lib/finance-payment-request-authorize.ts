/**
 * 결제요청 상태 변경 인가.
 * CS팀 3단계와 비-CS 2단계를 완전 분리 — 마케팅/물류 분기는 isCsRequest=false 경로만 사용.
 */

export type PaymentStatus =
  | "PENDING"
  | "CENTER_CHIEF_APPROVED"
  | "EXECUTIVE_PENDING"
  | "TEAM_LEAD_APPROVED"
  | "COMPLETED"
  | "REJECTED";

export function authorizePaymentStatusChange(params: {
  cur: PaymentStatus;
  next: PaymentStatus;
  isTeamLead: boolean;
  isCenterChief: boolean;
  isExecutive: boolean;
  isTransferExecutor: boolean;
  needsExecutiveFirstLine: boolean;
  needsExecutiveDirect: boolean;
  isCsRequest: boolean;
}): { ok: true } | { ok: false; status: number; error: string } {
  const {
    cur,
    next,
    isTeamLead,
    isCenterChief,
    isExecutive,
    isTransferExecutor,
    needsExecutiveFirstLine,
    needsExecutiveDirect,
    isCsRequest,
  } = params;

  const skipsTeamLeadApproval = needsExecutiveFirstLine || needsExecutiveDirect;

  if (next === "COMPLETED") {
    if (!isTransferExecutor) {
      return { ok: false, status: 403, error: "이체 완료는 이체 담당자만 처리할 수 있습니다." };
    }
    if (cur !== "TEAM_LEAD_APPROVED") {
      return { ok: false, status: 400, error: "승인 완료된 건만 이체 완료할 수 있습니다." };
    }
    return { ok: true };
  }

  // 이체 담당자 요청 또는 팀장 없는 부서: 대표만 PENDING → TEAM_LEAD_APPROVED
  if (skipsTeamLeadApproval) {
    if (isExecutive && cur === "PENDING" && (next === "TEAM_LEAD_APPROVED" || next === "REJECTED")) {
      return { ok: true };
    }
    if (isExecutive && cur === "TEAM_LEAD_APPROVED" && (next === "PENDING" || next === "REJECTED")) {
      return { ok: true };
    }
    if ((isTeamLead || isCenterChief) && !isExecutive) {
      const msg = needsExecutiveFirstLine
        ? "이체 담당자가 올린 요청은 대표(임원)만 승인할 수 있습니다."
        : "해당 부서는 팀장이 없어 대표(임원)만 승인할 수 있습니다.";
      return { ok: false, status: 403, error: msg };
    }
    return { ok: false, status: 403, error: "승인·반려 권한이 없습니다." };
  }

  // —— CS팀 전용 3단계 (다른 부서 로직과 완전 분리) ——
  if (isCsRequest) {
    if (isTeamLead && cur === "PENDING" && (next === "CENTER_CHIEF_APPROVED" || next === "REJECTED")) {
      return { ok: true };
    }
    if (
      isCenterChief &&
      cur === "CENTER_CHIEF_APPROVED" &&
      (next === "EXECUTIVE_PENDING" || next === "REJECTED")
    ) {
      return { ok: true };
    }
    if (
      isExecutive &&
      cur === "EXECUTIVE_PENDING" &&
      (next === "TEAM_LEAD_APPROVED" || next === "REJECTED" || next === "PENDING")
    ) {
      return { ok: true };
    }
    if (isExecutive && cur === "TEAM_LEAD_APPROVED" && (next === "PENDING" || next === "REJECTED")) {
      return { ok: true };
    }
    if (isTeamLead && cur === "CENTER_CHIEF_APPROVED" && next === "PENDING") {
      return { ok: true };
    }
    if (isCenterChief && cur === "EXECUTIVE_PENDING" && next === "CENTER_CHIEF_APPROVED") {
      return { ok: true };
    }
    return { ok: false, status: 403, error: "결재 권한이 없거나 처리할 수 없는 상태입니다." };
  }

  // 일반 직원 요청(비-CS): 팀장 1차 → 대표 2차 (기존 로직 유지)
  if (isTeamLead && cur === "PENDING" && (next === "EXECUTIVE_PENDING" || next === "REJECTED")) {
    return { ok: true };
  }
  if (isTeamLead && cur === "EXECUTIVE_PENDING" && (next === "PENDING" || next === "REJECTED")) {
    return { ok: true };
  }
  if (isExecutive && cur === "EXECUTIVE_PENDING" && (next === "TEAM_LEAD_APPROVED" || next === "REJECTED")) {
    return { ok: true };
  }
  if (isExecutive && cur === "EXECUTIVE_PENDING" && next === "PENDING") {
    return { ok: true };
  }
  if (isExecutive && cur === "TEAM_LEAD_APPROVED" && (next === "PENDING" || next === "REJECTED")) {
    return { ok: true };
  }

  return { ok: false, status: 403, error: "결재 권한이 없거나 처리할 수 없는 상태입니다." };
}
