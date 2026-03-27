/**
 * 계정별 사용 가능 기능(권한) 정의 및 체크
 * User.permissions가 있으면 해당 목록만 사용, 없으면 role 기본값 적용
 */

export type RoleName = "USER" | "TEAM_LEAD" | "EXECUTIVE" | "ADMIN";

/** 기능 키 → 한글 라벨 (관리 화면·API용) */
export const FEATURE_LABELS: Record<string, string> = {
  dashboard: "대시보드",
  schedule: "스케줄",
  tasks: "업무",
  leave: "연차/근태 신청·조회",
  leave_approve: "휴가 1차 승인(팀장)",
  leave_approve_final: "휴가 2차 승인(대표)",
  finance_request: "자금 요청",
  finance_approve: "자금 결재(승인/반려)",
  finance_transfer: "이체 완료 처리",
  finance_view: "자금 조회",
  chat: "채팅",
  quotations: "견적서",
  attendance: "출퇴근",
  announcements: "공지사항",
  board: "게시판",
  admin_employees: "직원 관리",
  admin_logs: "Daily Report 조회",
  admin_departments: "부서·직책",
  admin_projects: "브랜드/프로젝트",
  admin_company: "회사 정보",
  profile: "내 정보",
};

export const FEATURE_KEYS = Object.keys(FEATURE_LABELS) as string[];

/** 역할별 기본 허용 기능 (permissions 미설정 시 사용) */
const DEFAULT_BY_ROLE: Record<RoleName, string[]> = {
  USER: [
    "dashboard",
    "schedule",
    "tasks",
    "leave",
    "finance_request",
    "finance_view",
    "chat",
    "quotations",
    "attendance",
    "board",
    "profile",
  ],
  TEAM_LEAD: [
    "dashboard",
    "schedule",
    "tasks",
    "leave",
    "leave_approve",
    "finance_request",
    "finance_approve",
    "finance_view",
    "chat",
    "quotations",
    "attendance",
    "announcements",
    "board",
    "profile",
  ],
  EXECUTIVE: FEATURE_KEYS,
  ADMIN: FEATURE_KEYS,
};

function parsePermissions(json: string | null | undefined): string[] | null {
  if (json == null || String(json).trim() === "") return null;
  try {
    const arr = JSON.parse(json) as unknown;
    if (!Array.isArray(arr)) return null;
    return arr.filter((x): x is string => typeof x === "string");
  } catch {
    return null;
  }
}

/**
 * 역할에 따른 기본 허용 기능 목록 반환
 */
export function getDefaultPermissionsForRole(role: RoleName): string[] {
  return [...(DEFAULT_BY_ROLE[role] ?? DEFAULT_BY_ROLE.USER)];
}

/**
 * 사용자가 해당 기능을 사용할 수 있는지 여부
 * @param role - User.role
 * @param permissionsJson - User.permissions (JSON 문자열 또는 null)
 * @param feature - 기능 키
 */
export function hasPermission(
  role: RoleName,
  permissionsJson: string | null | undefined,
  feature: string
): boolean {
  const custom = parsePermissions(permissionsJson);
  if (custom !== null) return custom.includes(feature);
  const defaults = DEFAULT_BY_ROLE[role as RoleName] ?? DEFAULT_BY_ROLE.USER;
  return defaults.includes(feature);
}

/**
 * 사용자 객체로 권한 체크 (role, permissions 필드 사용)
 */
export function userHasPermission(
  user: { role: string; permissions?: string | null },
  feature: string
): boolean {
  const r = String(user.role ?? "USER").toUpperCase() as RoleName;
  return hasPermission(r, user.permissions ?? null, feature);
}
