import "server-only";

const APP_ID = process.env.ONESIGNAL_APP_ID || process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
const REST_KEY =
  process.env.ONESIGNAL_REST_API_KEY?.trim() || process.env.ONE_SIGNAL_REST_API_KEY?.trim() || "";

/** OneSignal 대시보드 REST — 구독 삭제(202 Accepted / 404 허용) */
export async function deleteOneSignalSubscriptionRemote(subscriptionId: string): Promise<boolean> {
  const appId = APP_ID?.trim();
  const key = REST_KEY;
  if (!appId || !key || !subscriptionId.trim()) return false;
  try {
    const res = await fetch(
      `https://api.onesignal.com/apps/${encodeURIComponent(appId)}/subscriptions/${encodeURIComponent(subscriptionId.trim())}`,
      {
        method: "DELETE",
        headers: { Authorization: `Key ${key}` },
      }
    );
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}
