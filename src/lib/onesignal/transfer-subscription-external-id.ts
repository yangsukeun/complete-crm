import "server-only";

const APP_ID = process.env.ONESIGNAL_APP_ID || process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
const REST_KEY =
  process.env.ONESIGNAL_REST_API_KEY?.trim() ||
  process.env.ONE_SIGNAL_REST_API_KEY?.trim() ||
  "";

/**
 * 웹 SDK에서 `OneSignal.login(userId)` 없이도 REST로 구독을 CRM 사용자(external_id)에 묶습니다.
 * 이후 `include_aliases.external_id` 발송이 구독과 매칭되기 쉬워집니다.
 */
export async function transferOneSignalSubscriptionToExternalId(
  subscriptionId: string,
  externalId: string
): Promise<{ ok: boolean; status?: number; detail?: string }> {
  const sub = subscriptionId.trim();
  const ext = externalId.trim();
  if (!APP_ID?.trim() || !REST_KEY || !sub || sub.length < 8 || !ext) {
    return { ok: false, detail: "missing_app_id_key_or_ids" };
  }

  const url = `https://api.onesignal.com/apps/${encodeURIComponent(APP_ID.trim())}/subscriptions/${encodeURIComponent(sub)}/owner`;

  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${REST_KEY}`,
      },
      body: JSON.stringify({ identity: { external_id: ext } }),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, detail: text.slice(0, 400) };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
