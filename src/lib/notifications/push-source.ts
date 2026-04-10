/**
 * OneSignal 웹 푸시 클릭 시 진입 출처 표시·딥링크 복구용 쿼리.
 * DB에 저장된 알림 link는 그대로 두고, 푸시 전용 URL에만 붙인다.
 */
export function appendPushNotificationSourceQuery(href: string | undefined): string | undefined {
  if (href == null || !String(href).trim()) return href;
  const h = String(href).trim();
  if (/[?&]from=notification(?:&|$)/.test(h)) return h;
  const join = h.includes("?") ? "&" : "?";
  return `${h}${join}from=notification`;
}
