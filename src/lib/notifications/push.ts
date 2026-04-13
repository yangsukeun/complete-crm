import "server-only";

import prisma from "@/lib/prisma";
import { isLikelyOneSignalSubscriptionId } from "@/lib/onesignal/subscription-id";
import { isOneSignalServerDebug } from "@/lib/onesignal-debug";
import { appendPushNotificationSourceQuery } from "@/lib/notifications/push-source";

type PushPriority = "high" | "medium" | "low";

export type PushPayload = {
  userIds: string[];
  title: string;
  message: string;
  /** 지정 시 OneSignal headings (미지정이면 title로 ko/en 동일) */
  headings?: Record<string, string>;
  /** 지정 시 OneSignal contents (미지정이면 message로 ko/en 동일) */
  contents?: Record<string, string>;
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

/**
 * 푸시 클릭·아이콘 절대 URL의 origin.
 * - Vercel 기본 도메인(vercel.app)은 제외하고, 없으면 운영 www 도메인으로 폴백.
 * - `NEXT_PUBLIC_PUSH_ORIGIN`을 Vercel Production에 두면(예: https://www.cpcrm.co.kr) 미리보기·VERCEL_URL 혼선을 줄일 수 있음.
 */
function publicAppOriginForPush(): string {
  const vercelHost = process.env.VERCEL_URL?.trim();
  const fromVercel = vercelHost ? `https://${vercelHost.replace(/^https?:\/\//i, "")}` : "";

  const candidates = [
    process.env.NEXT_PUBLIC_PUSH_ORIGIN,
    process.env.NEXT_PUBLIC_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
    process.env.AUTH_URL,
    fromVercel,
  ];

  for (const raw of candidates) {
    const envUrl = (raw ?? "").trim().replace(/\/$/, "");
    if (!envUrl || envUrl.includes("vercel.app")) continue;
    try {
      const u = new URL(envUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      return u.origin;
    } catch {
      /* 다음 후보 */
    }
  }

  return "https://www.cpcrm.co.kr";
}

function absoluteUrlForPush(href: string | undefined): string | undefined {
  if (!href?.trim()) return undefined;
  const h = href.trim();
  if (/^https?:\/\//i.test(h)) {
    try {
      const u = new URL(h);
      if (u.hostname.endsWith(".vercel.app")) {
        return `${publicAppOriginForPush()}${u.pathname}${u.search}${u.hash}`;
      }
    } catch {
      /* keep h */
    }
    return h;
  }
  const base = publicAppOriginForPush();
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
    type Row = {
      id: string;
      oneSignalPlayerId: string | null;
      playerId?: string | null;
      playerIds?: string[] | null;
    };
    try {

      function subscriptionIdsFromRow(r: Row): string[] {
        const set = new Set<string>();
        const add = (s: string | null | undefined) => {
          const t = s?.trim();
          if (t && isLikelyOneSignalSubscriptionId(t)) set.add(t);
        };
        if (Array.isArray(r.playerIds)) {
          for (const x of r.playerIds) {
            if (typeof x === "string") add(x);
          }
        }
        add(r.playerId);
        add(r.oneSignalPlayerId);
        return [...set];
      }

      let rows: Row[];
      try {
        rows = await prisma.user.findMany({
          where: { id: { in: externalIds } },
          select: { id: true, playerIds: true, oneSignalPlayerId: true, playerId: true },
        });
      } catch (firstErr) {
        const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
        if (/playerIds|Unknown column|does not exist|Unknown field/i.test(msg)) {
          console.warn("[OneSignal push] ② playerIds 컬럼 없음 → playerId/oneSignalPlayerId만 조회", {
            message: msg.slice(0, 200),
          });
          try {
            rows = await prisma.user.findMany({
              where: { id: { in: externalIds } },
              select: { id: true, oneSignalPlayerId: true, playerId: true },
            });
            rows = rows.map((r) => ({ ...r, playerIds: [] }));
          } catch (secondErr) {
            const msg2 = secondErr instanceof Error ? secondErr.message : String(secondErr);
            if (/playerId|Unknown column|does not exist/i.test(msg2)) {
              console.warn("[OneSignal push] ② playerId 컬럼 없음 → oneSignalPlayerId만 조회", {
                message: msg2.slice(0, 200),
              });
              rows = await prisma.user.findMany({
                where: { id: { in: externalIds } },
                select: { id: true, oneSignalPlayerId: true },
              });
              rows = rows.map((r) => ({ ...r, playerId: null, playerIds: [] }));
            } else {
              throw secondErr;
            }
          }
        } else if (/playerId|Unknown column|does not exist/i.test(msg)) {
          console.warn("[OneSignal push] ② playerId 컬럼 없음 → oneSignalPlayerId만 조회", {
            message: msg.slice(0, 200),
          });
          rows = await prisma.user.findMany({
            where: { id: { in: externalIds } },
            select: { id: true, oneSignalPlayerId: true },
          });
          rows = rows.map((r) => ({ ...r, playerId: null, playerIds: [] }));
        } else {
          throw firstErr;
        }
      }
      console.log("[OneSignal push] ② DB User 푸시 ID 조회", {
        rowCount: rows.length,
        ids: rows.map((r) => ({
          userId: r.id,
          subscriptionCount: subscriptionIdsFromRow(r).length,
          hasLegacyPlayerId: Boolean(r.playerId?.trim()),
          hasLegacyOneSignal: Boolean(r.oneSignalPlayerId?.trim()),
        })),
      });
      const all = new Set<string>();
      for (const r of rows) {
        for (const sid of subscriptionIdsFromRow(r)) {
          all.add(sid);
        }
      }
      subscriptionIds = [...all];
    } catch (dbErr) {
      console.error("[OneSignal push] DB 조회 실패 → external_id만 사용", dbErr);
    }

    const launchUrl = absoluteUrlForPush(appendPushNotificationSourceQuery(payload.url));

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

    const headings =
      payload.headings ??
      ({ en: payload.title, ko: payload.title } satisfies Record<string, string>);
    const contents =
      payload.contents ??
      ({ en: payload.message, ko: payload.message } satisfies Record<string, string>);
    const data = payload.data ?? {};
    const pri = payload.priority === "high" ? 10 : 5;

    const baseBody: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      target_channel: "push",
      headings,
      contents,
      data,
      priority: pri,
    };
    if (launchUrl) baseBody.web_url = launchUrl;
    const pushOrigin = publicAppOriginForPush();
    try {
      const icon = new URL("/api/branding/pwa-icon?size=192", pushOrigin);
      if (icon.protocol === "https:" || icon.hostname === "localhost") {
        baseBody.chrome_web_icon = icon.href;
      }
    } catch {
      /* 아이콘 생략 */
    }

    const singleRecipient = externalIds.length === 1;
    const webPushTopic =
      singleRecipient
        ? `crm-${externalIds[0]}`.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64)
        : undefined;

    function hasInvalidExternalAliases(errors: unknown): boolean {
      if (!errors || typeof errors !== "object") return false;
      const inv = (errors as Record<string, unknown>).invalid_aliases;
      if (!inv || typeof inv !== "object") return false;
      const ext = (inv as Record<string, unknown>).external_id;
      return Array.isArray(ext) && ext.length > 0;
    }

    type PostPushResult = { recipients: number; invalidExternalAliases: boolean };

    async function postOneSignal(body: Record<string, unknown>): Promise<PostPushResult> {
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
        return { recipients: -1, invalidExternalAliases: false };
      }
      console.log("[Push] OneSignal response:", text.length > 2000 ? `${text.slice(0, 2000)}…` : text);
      const recipients = parsed?.recipients;
      const errors = parsed?.errors;
      const invalidExternalAliases = hasInvalidExternalAliases(errors);
      console.log("[OneSignal push] ⑤ 응답 OK (api.onesignal.com)", {
        id: parsed?.id,
        recipients,
        errors: errors ?? null,
        invalidExternalAliases,
        bodyPreview: dbg ? (parsed ?? text.slice(0, 300)) : undefined,
      });
      if (errors !== undefined && errors !== null) {
        console.warn("[OneSignal push] API errors 필드", errors);
      }
      if (invalidExternalAliases) {
        console.warn(
          "[OneSignal push] invalid_aliases.external_id → OneSignal에 해당 external_id가 없거나 잘못됨(login/Transfer 필요). DB 구독 ID 병행 발송이 있으면 그 경로로 보완됩니다."
        );
      }
      if (typeof recipients === "number" && recipients === 0) {
        console.warn(
          "[OneSignal push] recipients 0 → DB 구독 ID·알림 권한·allowed origin 확인."
        );
      }
      const r = typeof recipients === "number" ? recipients : 0;
      return { recipients: r, invalidExternalAliases };
    }

    /**
     * external_id(include_aliases)와 DB 구독 ID(include_subscription_ids)를 항상 병행 발송.
     * (이전: external만 성공 시 recipients≥1이면 구독 폴백 미실행 → 모바일 등 미연동 기기 누락)
     * 동일 기기가 두 경로 모두에 잡히면 알림이 중복될 수 있음(수용·또는 OS/OneSignal이 일부 흡수).
     */
    const extBody: Record<string, unknown> = {
      ...baseBody,
      include_aliases: { external_id: externalIds },
    };
    if (webPushTopic) extBody.web_push_topic = webPushTopic;

    const subBody: Record<string, unknown> = {
      ...baseBody,
      include_subscription_ids: subscriptionIds,
    };
    if (webPushTopic) subBody.web_push_topic = webPushTopic;

    const parallel: Promise<PostPushResult>[] = [postOneSignal(extBody)];
    if (subscriptionIds.length > 0) {
      parallel.push(postOneSignal(subBody));
    }

    const [ext, sub] = await Promise.all(parallel);

    console.log("[OneSignal push] ⑥ 병행 발송 요약", {
      external_id_recipients: ext.recipients,
      external_id_invalid_aliases: ext.invalidExternalAliases,
      subscription_path_sent: subscriptionIds.length > 0,
      subscription_ids_count: subscriptionIds.length,
      subscription_id_recipients: sub?.recipients ?? null,
    });

    if (subscriptionIds.length > 0 && sub && sub.recipients <= 0 && !sub.invalidExternalAliases) {
      console.warn("[OneSignal push] 구독 ID 경로 수신 0 — 기기에서 알림 허용·구독 등록 확인");
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
