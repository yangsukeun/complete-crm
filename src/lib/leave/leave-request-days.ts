/** 승인·재차감 시 휴가 일수 계산 (LeaveRequest.days 필드 없음) */
export const LEAVE_TYPE_DAYS: Record<string, number> = {
  ANNUAL: 1,
  HALF_AM: 0.5,
  HALF_PM: 0.5,
  QUARTER_AM: 0.25,
  QUARTER_PM: 0.25,
};

export function isSickLeaveType(type: string): boolean {
  return type === "SICK_PAID" || type === "SICK_UNPAID";
}

export function leaveRequestDays(type: string, startDate: Date, endDate: Date): number {
  if (isSickLeaveType(type)) return 0;
  if (type === "ANNUAL") {
    return Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }
  return LEAVE_TYPE_DAYS[type] ?? 0;
}
