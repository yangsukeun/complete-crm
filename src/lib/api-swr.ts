// [PERF-mode-logo] 전역 SWR fallback 키와 동일한 문자열 사용
export const SWR_MODE_KEY = "/api/mode" as const;
export const SWR_LOGO_SETTINGS_KEY = "/api/settings/logo" as const;

/** SWR용 JSON GET — 동일 URL 요청은 Provider의 dedupingInterval로 합쳐짐 */

export async function jsonFetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    throw err;
  }
  return res.json() as Promise<T>;
}

/** 스케줄 목록 — x-workspace 헤더로 MY / TEAM 구분 (키는 튜플로 dedupe) */
export async function schedulesWorkspaceFetcher(
  arg: readonly [url: string, workspace: "MY" | "TEAM"]
): Promise<unknown[]> {
  const [url, workspace] = arg;
  const res = await fetch(url, {
    credentials: "include",
    headers: { "x-workspace": workspace },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export const SWR_KEYS = {
  chatsList: "/api/chats",
  notificationUnread: "/api/notifications/unread-count",
  financeAlertsCount: "/api/finance/alerts/count",
  announcements: "/api/announcements",
  /** 전체 업무 트리(목록·마인드맵 필터용) — 호출처에서 dedupingInterval 300_000 권장 [PERF-auto] */
  tasksAll: "/api/tasks?all=1",
  scheduleInvites: "/api/schedules/invites",
  leave: "/api/leave",
  googleCalendar: "/api/integrations/google-calendar",
  /** 캘린더: MY+TEAM 일정 단일 요청 */
  schedulesBundle: "/api/schedules/bundle",
  /** 대시보드 매출·수금 (GET = getDashboardSalesStats) */
  dashboardSales: "/api/dashboard/sales-stats",
} as const;

export const schedulePersonalKey = ["/api/schedules", "MY"] as const;
export const scheduleTeamKey = ["/api/schedules", "TEAM"] as const;
