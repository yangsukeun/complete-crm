import "server-only";

import { isOneSignalServerDebug } from "@/lib/onesignal-debug";

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

/** 공식 문서: POST https://api.onesignal.com/notifications + Authorization: Key … (레거시 /apps/{id}/notifications·Basic 조합은 실패할 수 있음) */
const ONESIGNAL_CREATE_URL = "https://api.onesignal.com/notifications";

export async function sendPushToUsers(payload: PushPayload): Promise<void> {
  const dbg = isOneSignalServerDebug();
  try {
    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      if (dbg) {
        console.warn(
          "[OneSignal push] ① 스킵: 환경변수 없음 (ONESIGNAL_APP_ID 또는 ONESIGNAL_REST_API_KEY)"
        );
      } else if (process.env.NODE_ENV === "development") {
        console.warn("[OneSignal] env not configured, skip push");
      }
      return;
    }
    if (!payload.userIds.length) {
      if (dbg) console.warn("[OneSignal push] ① 스킵: userIds 비어 있음");
      return;
    }

    const externalIds = payload.userIds.map((id) => String(id));
    if (dbg) {
      console.log("[OneSignal push] ② 요청 준비", {
        url: ONESIGNAL_CREATE_URL,
        app_id: ONESIGNAL_APP_ID,
        target_channel: "push",
        include_aliases_external_id: externalIds,
        titlePreview: payload.title.slice(0, 80),
      });
    }

    const body: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      /** 푸시 채널 명시 (누락 시 발송·수신 단계에서 누락될 수 있음) */
      target_channel: "push",
      include_aliases: {
        external_id: externalIds,
      },
      headings: { en: payload.title },
      contents: { en: payload.message },
      data: payload.data ?? {},
      priority: payload.priority === "high" ? 10 : 5,
    };
    if (payload.url) body.web_url = payload.url;

    const res = await fetch(ONESIGNAL_CREATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Key ${ONESIGNAL_REST_API_KEY.trim()}`,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      console.error("[OneSignal push] ③ HTTP 실패", res.status, text.slice(0, 500));
      return;
    }

    if (dbg) {
      console.log("[OneSignal push] ④ 응답 OK (본문)", parsed ?? text.slice(0, 300));
    }

    const errors = parsed?.errors;
    const recipients = parsed?.recipients;
    if (errors !== undefined && errors !== null) {
      console.warn("[OneSignal push] ⑤ API errors 필드 (수신 0일 수 있음)", errors);
    }
    if (typeof recipients === "number" && recipients === 0) {
      console.warn(
        "[OneSignal push] ⑤ recipients=0 → 해당 external_id로 구독 중인 기기 없음. 클라이언트에서 OneSignal.login(User.id)·알림 권한·도메인 허용 확인."
      );
    }
  } catch (e) {
    console.error("[OneSignal push] 예외", e);
  }
}

export async function sendPushToUser(input: Omit<PushPayload, "userIds"> & { userId: string }): Promise<void> {
  return sendPushToUsers({ ...input, userIds: [input.userId] });
}
