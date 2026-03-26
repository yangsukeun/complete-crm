/** SWR용 JSON GET — 동일 URL 요청은 Provider의 dedupingInterval로 합쳐짐 */

export async function jsonFetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    throw err;
  }
  return res.json() as Promise<T>;
}

export const SWR_KEYS = {
  chatsList: "/api/chats",
  notificationUnread: "/api/notifications/unread-count",
  financeAlertsCount: "/api/finance/alerts/count",
} as const;
