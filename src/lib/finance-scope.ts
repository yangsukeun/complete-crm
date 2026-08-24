/**
 * 자금(결제 요청) 조회 범위 — 모든 자금 조회 API가 이 함수 하나를 통과한다.
 *
 * 우선순위:
 * 1. ADMIN / EXECUTIVE → ALL
 * 2. 이체담당자(transferExecutorIds) → ALL (기존 담당 범위 유지, 변경 금지)
 * 3. TEAM_LEAD / CENTER_CHIEF → DEPARTMENT (신청자 department 일치)
 * 4. 그 외 → SELF (requesterId 본인)
 */

import { normalizeDepartment } from "@/lib/leave-department-access";

export type FinanceScopeKind = "ALL" | "DEPARTMENT" | "SELF";

export type FinanceScope = {
  kind: FinanceScopeKind;
  /** UI 표시: "전체" | "○○팀 내역" | "내 신청 내역" */
  label: string;
  userId: string;
  department: string | null;
  isTransferExecutor: boolean;
};

export function getFinanceScope(input: {
  userId: string;
  role: string | null | undefined;
  department: string | null | undefined;
  transferExecutorIds: readonly string[];
}): FinanceScope {
  const role = String(input.role ?? "").toUpperCase();
  const department = input.department?.trim() ? String(input.department).trim() : null;
  const isTransferExecutor = input.transferExecutorIds.includes(input.userId);

  if (role === "ADMIN" || role === "EXECUTIVE") {
    return {
      kind: "ALL",
      label: "전체",
      userId: input.userId,
      department,
      isTransferExecutor,
    };
  }

  // 이체담당자: 기존과 동일하게 전체 목록 (회귀 금지)
  if (isTransferExecutor) {
    return {
      kind: "ALL",
      label: "전체",
      userId: input.userId,
      department,
      isTransferExecutor: true,
    };
  }

  if (role === "TEAM_LEAD" || role === "CENTER_CHIEF") {
    const deptLabel = department ? `${department} 내역` : "부서 내역";
    return {
      kind: "DEPARTMENT",
      label: deptLabel,
      userId: input.userId,
      department,
      isTransferExecutor: false,
    };
  }

  return {
    kind: "SELF",
    label: "내 신청 내역",
    userId: input.userId,
    department,
    isTransferExecutor: false,
  };
}

export function isPaymentRequestInFinanceScope(
  scope: FinanceScope,
  row: {
    requesterId?: string | null;
    requester?: { department?: string | null } | null;
    requesterDepartment?: string | null;
  }
): boolean {
  if (scope.kind === "ALL") return true;
  if (scope.kind === "SELF") {
    return row.requesterId === scope.userId;
  }
  // DEPARTMENT
  const applicantDept =
    row.requesterDepartment ?? row.requester?.department ?? null;
  const leadDept = normalizeDepartment(scope.department);
  const appDept = normalizeDepartment(applicantDept);
  if (!leadDept || !appDept) return false;
  return leadDept === appDept;
}

/** Prisma where 조각 (findMany / findFirst) */
export function financeScopePrismaWhere(scope: FinanceScope): Record<string, unknown> {
  if (scope.kind === "ALL") return {};
  if (scope.kind === "SELF") return { requesterId: scope.userId };
  const dept = normalizeDepartment(scope.department);
  if (!dept) {
    // 부서 미설정 팀장/센터장: 본인 건만 (과다 노출 방지)
    return { requesterId: scope.userId };
  }
  return {
    requester: { department: dept },
  };
}
