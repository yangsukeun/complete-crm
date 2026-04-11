/**
 * OneSignal User Model 구독 ID는 문서상 UUID(v4) 형식.
 * FCM/웹 푸시 endpoint 문자열을 구독 ID로 저장하면 Transfer·발송이 실패해 "계정 없음"처럼 보일 수 있음.
 */
const ONESIGNAL_SUBSCRIPTION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLikelyOneSignalSubscriptionId(s: string | null | undefined): boolean {
  const t = s?.trim();
  if (!t) return false;
  return ONESIGNAL_SUBSCRIPTION_UUID_RE.test(t);
}
