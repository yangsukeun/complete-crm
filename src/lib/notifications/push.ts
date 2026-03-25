import "server-only";

import prisma from "@/lib/prisma";
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

/** 서버: ONESIGNAL_APP_ID 또는 클라이언트와 동일한 NEXT_PUBLIC_ONESIGNAL_APP_ID */
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
/** REST API Key는 서버 전용. (대시보드 Keys & IDs의 REST API Key — User Auth Key와 혼동 금지) */
const ONESIGNAL_REST_API_KEY =
  process.env.ONESIGNAL_REST_API_KEY?.trim() ||
  process.env.ONE_SIGNAL_REST_API_KEY?.trim() ||
  undefined;

/** https://api.onesignal.com/notifications — Authorization: Key + REST API Key, Content-Type: application/json */
const ONESIGNAL_NOTIFICATIONS_URL = "https://api.onesignal.com/notifications";

function absoluteUrlForPush(href: string | undefined): string | undefined {
  if (!href?.trim()) return undefined;
  const h = href.trim();
  if (/^https?:\/\//i.test(h)) return h;
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.replace(/^https?:\/\//i, "")}` : "") ||
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    "";
  if (!base) return h.startsWith("/") ? h : `/${h}`;
  return `${base}${h.startsWith("/") ? h : `/${h}`}`;
}

export async function sendPushToUsers(payload: PushPayload): Promise<void> {
  const dbg = isOneSignalServerDebug();
  try {
    console.log("[OneSignal push] ① 진입 sendPushToUsers", {
      recipientCount: payload.userIds.length,
      titlePreview: payload.title.slice(0, 60),
      priority: payload.priority ?? "(default)",
      hasAppId: Boolean(ONESIGNAL_APP_ID),
      hasRestKey: Boolean(ONESIGNAL_REST_API_KEY),
    });
    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      console.warn(
        "[OneSignal push] ① 스킵: 환경변수 없음 (ONESIGNAL_APP_ID 또는 NEXT_PUBLIC_ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY)"
      );
      return;
    }
    if (!payload.userIds.length) {
      console.warn("[OneSignal push] ① 스킵: userIds 비어 있음");
      return;
    }

    const externalIds = payload.userIds.map((id) => String(id));

    let subscriptionIds: string[] = [];
    try {
      type Row = { id: string; oneSignalPlayerId: string | null; playerId?: string | null };
      let rows: Row[];
      try {
        rows = await prisma.user.findMany({
          where: { id: { in: externalIds } },
          select: { id: true, oneSignalPlayerId: true, playerId: true },
        });
      } catch (firstErr) {
        const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
        if (/playerId|Unknown column|does not exist/i.test(msg)) {
          console.warn("[OneSignal push] ② playerId 컬럼 없음 → oneSignalPlayerId만 조회", {
            message: msg.slice(0, 200),
          });
          rows = await prisma.user.findMany({
            where: { id: { in: externalIds } },
            select: { id: true, oneSignalPlayerId: true },
          });
          rows = rows.map((r) => ({ ...r, playerId: null }));
        } else {
          throw firstErr;
        }
      }
      console.log("[OneSignal push] ② DB User 푸시 ID 조회", {
        rowCount: rows.length,
        ids: rows.map((r) => ({
          userId: r.id,
          hasPlayerId: Boolean(r.playerId?.trim()),
          hasLegacyField: Boolean(r.oneSignalPlayerId?.trim()),
        })),
      });
      subscriptionIds = rows
        .map((r) => (r.playerId?.trim() || r.oneSignalPlayerId?.trim()) ?? "")
        .filter((s): s is string => Boolean(s && s.length > 8));
    } catch (dbErr) {
      console.error("[OneSignal push] DB 조회 실패 → external_id만 사용", dbErr);
    }

    const launchUrl = absoluteUrlForPush(payload.url);

    for (const sid of subscriptionIds) {
      console.log(`[Push] sending to subscriptionId: ${sid}`);
    }
    if (subscriptionIds.length === 0) {
      console.log(
        `[Push] sending to subscriptionId: (none in DB) external_id only: ${JSON.stringify(externalIds)}`
      );
    }

    console.log("[OneSignal push] ③ OneSignal REST 페이로드 준비", {
      url: ONESIGNAL_NOTIFICATIONS_URL,
      app_id_tail: String(ONESIGNAL_APP_ID).slice(-8),
      externalIds,
      subscriptionIdsCount: subscriptionIds.length,
      launchUrl: launchUrl ?? payload.url,
      titlePreview: payload.title.slice(0, 80),
      debugVerbose: dbg,
    });

    const headings = { en: payload.title, ko: payload.title };
    const contents = { en: payload.message, ko: payload.message };
    const data = payload.data ?? {};
    const pri = payload.priority === "high" ? 10 : 5;

    /** 요청당 타겟 방식 하나만 사용 (문서: aliases와 subscription_id 혼합 금지). */
    const body: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      target_channel: "push",
      headings,
      contents,
      data,
      priority: pri,
    };
    if (launchUrl) body.web_url = launchUrl;

    if (subscriptionIds.length > 0) {
      body.include_subscription_ids = subscriptionIds;
    } else {
      body.include_aliases = { external_id: externalIds };
    }

    const res = await fetch(ONESIGNAL_NOTIFICATIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
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
      console.log("[Push] OneSignal response:", text.length > 2000 ? `${text.slice(0, 2000)}…` : text);
      console.error("[OneSignal push] ④ HTTP 실패", {
        status: res.status,
        bodySnippet: text.slice(0, 800),
        parsedErrors: parsed && typeof parsed === "object" ? (parsed as { errors?: unknown }).errors : null,
      });
      return;
    }

    console.log("[Push] OneSignal response:", text.length > 2000 ? `${text.slice(0, 2000)}…` : text);

    console.log("[OneSignal push] ⑤ 응답 OK (api.onesignal.com)", {
      id: parsed?.id,
      recipients: parsed?.recipients,
      errors: parsed?.errors ?? null,
      bodyPreview: dbg ? (parsed ?? text.slice(0, 300)) : undefined,
    });

    const errors = parsed?.errors;
    const recipients = parsed?.recipients;
    if (errors !== undefined && errors !== null) {
      console.warn("[OneSignal push] API errors 필드 (수신 0일 수 있음)", errors);
    }
    if (typeof recipients === "number" && recipients === 0) {
      console.warn(
        "[OneSignal push] recipients 0 → 구독 ID·external_id·클라이언트 OneSignal.login(User.id), 권한, allowed origin 확인."
      );
    }
  } catch (e) {
    console.error("[OneSignal push] 예외 (로그만, 호출 API 500 전파 안 함)", {
      name: e instanceof Error ? e.name : typeof e,
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack?.slice(0, 500) : undefined,
    });
  }
}

export async function sendPushToUser(input: Omit<PushPayload, "userIds"> & { userId: string }): Promise<void> {
  console.log("[OneSignal push] sendPushToUser → sendPushToUsers", {
    userId: input.userId,
    messageLen: input.message?.length ?? 0,
    url: input.url ?? null,
    priority: input.priority,
  });
  return sendPushToUsers({ ...input, userIds: [input.userId] });
}
