export function leaveAccrualTypeLabel(type: string): string {
  const m: Record<string, string> = {
    MONTHLY_UNDER_ONE_YEAR: "1년차 월차",
    ANNUAL_AFTER_ONE_YEAR: "정규 연차",
    TENURE_BONUS: "근속가산",
    CARRY_OVER: "이월",
  };
  return m[type] ?? type;
}

export function leaveRequestTypeLabel(t: string): string {
  const m: Record<string, string> = {
    ANNUAL: "연차",
    HALF_AM: "반차(오전)",
    HALF_PM: "반차(오후)",
    QUARTER_AM: "반반차(오전)",
    QUARTER_PM: "반반차(오후)",
    SICK_PAID: "병가(유급)",
    SICK_UNPAID: "병가(무급)",
  };
  return m[t] ?? t;
}

export function leaveRequestStatusLabel(s: string): string {
  if (s === "APPROVED") return "승인";
  if (s === "REJECTED") return "반려";
  if (s === "PENDING") return "대기";
  if (s === "TEAM_LEAD_APPROVED") return "팀장승인";
  if (s === "CANCEL_REQUESTED") return "취소요청";
  if (s === "CANCELLED") return "취소";
  return s;
}

export const ROLE_LABEL: Record<string, string> = {
  EXECUTIVE: "대표",
  ADMIN: "관리자",
  TEAM_LEAD: "팀장",
  USER: "직원",
};

export function roleLabel(role: string): string {
  return ROLE_LABEL[role.toUpperCase()] ?? role;
}
