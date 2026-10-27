import {WORKSPACE_OWNER} from "./workspace-areas";
import { normalizeDepartment } from "@/lib/leave-department-access";
import {
  getUserDepartments,
  type UserDepartments,
} from "@/lib/user-departments";

export type FinanceScopeKind = "ALL" | "DEPARTMENT" | "SELF_AND_DEPARTMENTS" | "SELF";

export type FinanceScope = {
  kind: FinanceScopeKind;
  /** UI: "전체" | "마케팅 + CS팀 내역" | "마케팅 + 내 신청 내역" | "내 신청 내역" */
  label: string;
  userId: string;
  /** 주부서 (결재 가드용·하위 호환) */
  department: string | null;
  /** DEPARTMENT: 주부서+겸직 / SELF_AND_DEPARTMENTS: 겸직만 */
  departments: string[];
  isTransferExecutor: boolean;
};

function formatDeptListLabel(depts: string[], suffix: string): string {
  if (depts.length === 0) return suffix.trim() || "내역";
  return `${depts.join(" + ")}${suffix}`;
}

export function getFinanceScope(input: {
  userId: string;
  role: string | null | undefined;
  department?: string | null | undefined;
  /** 주부서+겸직. 없으면 department만으로 구성 */
  userDepartments?: UserDepartments | null;
  transferExecutorIds: readonly string[];
  /** 비팀장 겸직 조회 확장에 필요 */
  hasFinanceView?: boolean;
}): FinanceScope {
  const role = String(input.role ?? "").toUpperCase();
  const depts =
    input.userDepartments ??
    getUserDepartments({ department: input.department ?? null, additionalDepartments: null });
  const department = depts.primary;
  const isTransferExecutor = input.transferExecutorIds.includes(input.userId);

  if (input.userId === WORKSPACE_OWNER) {
    return {
      kind: "ALL",
      label: "전체",
      userId: input.userId,
      department,
      departments: depts.all,
      isTransferExecutor,
    };
  }

  if (role === "TEAM_LEAD" || role === "CENTER_CHIEF") {
    const list = depts.all;
    return {
      kind: "DEPARTMENT",
      label: list.length > 0 ? formatDeptListLabel(list, " 내역") : "부서 내역",
      userId: input.userId,
      department,
      departments: list,
      isTransferExecutor,
    };
  }

  // 비팀장: 겸직 + finance_view → 겸직 부서 건 ∪ 본인 건
  if (input.hasFinanceView && depts.additional.length > 0) {
    return {
      kind: "SELF_AND_DEPARTMENTS",
      label: formatDeptListLabel(depts.additional, " + 내 신청 내역"),
      userId: input.userId,
      department,
      departments: depts.additional,
      isTransferExecutor,
    };
  }

  return {
    kind: "SELF",
    label: "내 신청 내역",
    userId: input.userId,
    department,
    departments: [],
    isTransferExecutor,
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

  const applicantDept = normalizeDepartment(
    row.requesterDepartment ?? row.requester?.department ?? null
  );
  const deptMatch =
    applicantDept.length > 0 &&
    scope.departments.some((d) => normalizeDepartment(d) === applicantDept);

  if (scope.kind === "DEPARTMENT") {
    return scope.departments.length === 0 ? row.requesterId === scope.userId : deptMatch;
  }

  // SELF_AND_DEPARTMENTS: 겸직 부서 건 ∪ 본인 건
  if (row.requesterId === scope.userId) return true;
  return deptMatch;
}

/** Prisma where 조각 (findMany / findFirst) */
export function financeScopePrismaWhere(scope: FinanceScope): Record<string, unknown> {
  if (scope.kind === "ALL") return {};
  if (scope.kind === "SELF") return { requesterId: scope.userId };
  if (scope.kind === "SELF_AND_DEPARTMENTS") {
    const depts = scope.departments.map((d) => normalizeDepartment(d)).filter(Boolean);
    if (depts.length === 0) return { requesterId: scope.userId };
    return {
      OR: [{ requesterId: scope.userId }, { requester: { department: { in: depts } } }],
    };
  }
  const depts = scope.departments.map((d) => normalizeDepartment(d)).filter(Boolean);
  if (depts.length === 0) {
    return { requesterId: scope.userId };
  }
  return {
    requester: { department: { in: depts } },
  };
}
