import { isCsOrgDepartment } from "@/lib/org-access";
import { isCsDepartment } from "@/lib/cs-tools-access";
import { parsePermissions } from "@/lib/permissions";
import { isExecutiveOrAdmin } from "@/lib/role-access";

/** User.permissions 개별 지정으로만 부여. 역할 기본값으로는 이석 버튼을 열지 않음. */
export const AWAY_EXCEPTION_FEATURE = "attendance_away";

export const AWAY_STATUS_EVENT = "away-status-changed";

export type AwayTypeName = "BATHROOM" | "SMOKING";

export function isAwayType(v: unknown): v is AwayTypeName {
  return v === "BATHROOM" || v === "SMOKING";
}

export function awayTypeLabel(type: AwayTypeName): string {
  return type === "SMOKING" ? "흡연" : "화장실";
}

export type AwayOpenState = {
  id: string;
  type: AwayTypeName;
  startedAt: string;
};

export type AwayDaySummary = {
  todayEndedMs: number;
  bathroomEndedMs: number;
  smokingEndedMs: number;
  open: AwayOpenState | null;
};

export function summarizeAwayLogs(
  logs: { id: string; type: string; startedAt: Date; endedAt: Date | null }[],
): AwayDaySummary {
  let todayEndedMs = 0;
  let bathroomEndedMs = 0;
  let smokingEndedMs = 0;
  let open: AwayOpenState | null = null;
  for (const log of logs) {
    if (!log.endedAt) {
      if (isAwayType(log.type)) {
        open = { id: log.id, type: log.type, startedAt: log.startedAt.toISOString() };
      }
      continue;
    }
    const ms = Math.max(0, log.endedAt.getTime() - log.startedAt.getTime());
    todayEndedMs += ms;
    if (log.type === "SMOKING") smokingEndedMs += ms;
    else bathroomEndedMs += ms;
  }
  return { todayEndedMs, bathroomEndedMs, smokingEndedMs, open };
}

export function liveAwayBreakdown(summary: AwayDaySummary, nowMs: number) {
  const openMs = summary.open
    ? Math.max(0, nowMs - new Date(summary.open.startedAt).getTime())
    : 0;
  return {
    totalMs: summary.todayEndedMs + openMs,
    bathroomMs: summary.bathroomEndedMs + (summary.open?.type === "BATHROOM" ? openMs : 0),
    smokingMs: summary.smokingEndedMs + (summary.open?.type === "SMOKING" ? openMs : 0),
  };
}

/** 대시보드·오버레이용 자리 비움 시간 */
export function formatAwayDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  if (m > 0) return s > 0 ? `${m}분 ${s}초` : `${m}분`;
  return `${s}초`;
}

/** 근무·이석 합계 표시 (분 단위) */
export function formatDurationMinutes(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0) return `${h}시간 ${min}분`;
  return `${min}분`;
}

export function computeWorkedMs(opts: {
  checkIn: Date | string | null;
  checkOut: Date | string | null;
  awayMs: number;
  nowMs: number;
  dayEndMs: number;
}): number | null {
  if (!opts.checkIn) return null;
  const start = new Date(opts.checkIn).getTime();
  if (Number.isNaN(start)) return null;
  const checkOutMs = opts.checkOut ? new Date(opts.checkOut).getTime() : NaN;
  const end = Number.isNaN(checkOutMs) ? Math.min(opts.nowMs, opts.dayEndMs) : checkOutMs;
  if (end < start) return 0;
  return Math.max(0, end - start - Math.max(0, opts.awayMs));
}

/**
 * 이석 버튼 노출·시작 API.
 * - CS부서(CS / CS팀)는 기본 허용
 * - 타부서(김소윤·김정우 등)는 User.permissions에 attendance_away가 있을 때만
 * - 대표/관리자라도 CS부서가 아니면 기본 미노출 (개별 키로만 예외)
 */
export function canUseAwayFeature(opts: {
  department: string | null | undefined;
  permissions?: string | null;
}): boolean {
  if (isCsDepartment(opts.department)) return true;
  const custom = parsePermissions(opts.permissions);
  return custom !== null && custom.includes(AWAY_EXCEPTION_FEATURE);
}

/** CS 팀장·센터장 (본사 대표/관리자 제외) */
export function isCsTeamManager(opts: {
  role: string | null | undefined;
  department: string | null | undefined;
}): boolean {
  const r = String(opts.role ?? "").toUpperCase();
  if (r !== "TEAM_LEAD" && r !== "CENTER_CHIEF") return false;
  return isCsOrgDepartment(opts.department);
}

/** 이석 현황·CS 근태: CS 팀장·센터장 + 대표/관리자 */
export function canViewAwayOverview(opts: {
  role: string | null | undefined;
  department: string | null | undefined;
}): boolean {
  if (isExecutiveOrAdmin(opts.role)) return true;
  return isCsTeamManager(opts);
}

export function notifyAwayStatusChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AWAY_STATUS_EVENT));
}
