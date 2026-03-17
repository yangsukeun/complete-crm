import "server-only";

type PushPriority = "high" | "medium" | "low";

export type PushPayload = {
  userIds: string[];
  title: string;
  message: string;
  url?: string;
  data?: Record<string, unknown>;
  priority?: PushPriority;
};

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

const ONE_SIGNAL_API_URL = "https://api.onesignal.com/apps";

export async function sendPushToUsers(payload: PushPayload): Promise<void> {
  try {
    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[OneSignal] env not configured, skip push");
      }
      return;
    }
    if (!payload.userIds.length) return;

    const body = {
      app_id: ONESIGNAL_APP_ID,
      include_aliases: {
        external_id: payload.userIds.map((id) => String(id)),
      },
      headings: { en: payload.title },
      contents: { en: payload.message },
      web_url: payload.url,
      data: payload.data ?? {},
      priority: payload.priority === "high" ? 10 : 5,
    };

    const res = await fetch(`${ONE_SIGNAL_API_URL}/${ONESIGNAL_APP_ID}/notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[OneSignal] push failed:", res.status, text);
    }
  } catch (e) {
    console.error("[OneSignal] push error:", e);
  }
}

export async function sendPushToUser(input: Omit<PushPayload, "userIds"> & { userId: string }): Promise<void> {
  return sendPushToUsers({ ...input, userIds: [input.userId] });
}

