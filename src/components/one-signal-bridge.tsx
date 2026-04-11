"use client";

import { useEffect, useRef } from "react";
import OneSignal from "react-onesignal";
import { clearProfileMeCache } from "@/lib/profile-me-client";

function clientDebug(): boolean {
  return (
    typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_DEBUG_ONESIGNAL === "1" || process.env.NODE_ENV === "development")
  );
}

/** 프로덕션 콘솔 노이즈 방지 — 상세 원샷 디버그는 env=1 일 때만 */
function verboseOsDebug(): boolean {
  return typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_ONESIGNAL === "1";
}

function logClient(step: string, payload?: Record<string, unknown>) {
  if (clientDebug()) {
    console.log(`[OneSignal client] ${step}`, payload ?? "");
  }
}

/**
 * OneSignal 웹 SDK는 대시보드의 사이트 URL과 브라우저 origin이 맞지 않으면
 * `Can only be used on: https://…` 형태로 초기화를 거부합니다.
 * localhost / 프리뷰 도메인에서는 init을 생략해 콘솔 오류를 막습니다.
 */
function oneSignalSkipInitReason(): string | null {
  if (typeof window === "undefined") return "no window";
  if (process.env.NEXT_PUBLIC_ONESIGNAL_ENABLE_ON_LOCALHOST === "1") {
    return null;
  }

  const host = window.location.hostname;
  const allowed = ["cpcrm.co.kr", "www.cpcrm.co.kr", "localhost", "127.0.0.1"];
  if (!allowed.some((d) => host.includes(d))) {
    return `현재 ${host} — 허용 도메인이 아니므로 OneSignal 초기화를 건너뜁니다.`;
  }
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  if (isLocal) {
    return "localhost — OneSignal 사이트 URL이 프로덕션만이면 SDK가 거부합니다. 로컬에서 쓰려면 대시보드에 http://localhost:3000(포트 포함)을 허용 출처로 추가하거나, NEXT_PUBLIC_ONESIGNAL_ENABLE_ON_LOCALHOST=1 을 설정하세요.";
  }

  const configured = (
    process.env.NEXT_PUBLIC_ONESIGNAL_ALLOWED_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    ""
  ).trim();

  if (!configured) return null;

  try {
    const expected = new URL(configured).origin;
    if (window.location.origin !== expected) {
      return `현재 ${window.location.origin} — 허용 프로덕션 출처는 ${expected} 입니다. Vercel 프리뷰·스테이징이면 대시보드에 해당 출처를 추가하거나, 이 환경에서는 NEXT_PUBLIC_ONESIGNAL_APP_ID 를 비워 주세요.`;
    }
  } catch {
    return null;
  }

  return null;
}

/** Web v16: REST `include_subscription_ids` 는 구독 레코드 id. id 가 비면 token(푸시 엔드포인트) 폴백 시도. */
async function resolveIdsForBackend(): Promise<{
  subscriptionId: string | null;
  onesignalUserId: string | null;
}> {
  const sub = OneSignal.User?.PushSubscription;
  const rawId = sub?.id;
  const rawToken = sub?.token;
  let subscriptionId =
    typeof rawId === "string" && rawId.trim()
      ? rawId.trim()
      : rawId != null && String(rawId).trim()
        ? String(rawId).trim()
        : null;

  try {
    const Sub = sub as unknown as {
      getId?: () => Promise<string | undefined>;
      getSubscriptionId?: () => Promise<string | undefined>;
    };
    if (!subscriptionId && typeof Sub?.getId === "function") {
      const v = await Sub.getId().catch(() => undefined);
      subscriptionId = v?.trim() || null;
    }
    if (!subscriptionId && typeof Sub?.getSubscriptionId === "function") {
      const v = await Sub.getSubscriptionId().catch(() => undefined);
      subscriptionId = v?.trim() || null;
    }
  } catch {
    /* */
  }

  if (!subscriptionId) {
    const tok =
      typeof rawToken === "string" && rawToken.trim()
        ? rawToken.trim()
        : rawToken != null && String(rawToken).trim()
          ? String(rawToken).trim()
          : null;
    if (tok && tok.length >= 8) {
      subscriptionId = tok;
    }
  }

  const onesignalUserId = OneSignal.User?.onesignalId?.trim() || null;

  if (verboseOsDebug()) {
    console.log("[OS DEBUG] resolveIdsForBackend", {
      pushId: subscriptionId ? `${subscriptionId.slice(0, 8)}…(len=${subscriptionId.length})` : null,
      optedIn: sub?.optedIn ?? null,
      hasRawId: Boolean(rawId),
      hasRawToken: Boolean(rawToken),
      onesignalUserId: onesignalUserId ? `${onesignalUserId.slice(0, 8)}…` : null,
    });
  }

  return { subscriptionId, onesignalUserId };
}

/**
 * 브라우저에서 OneSignal을 한 번 초기화하고, 로그인 시 external_id(User.id)와 맞춥니다.
 * 서버 푸시(`include_aliases.external_id`)와 동일한 값이어야 합니다.
 *
 * 연결 위치: app/layout.tsx → Providers (`src/components/providers.tsx`) 안에서 마운트됨. (_app.tsx 없음, App Router)
 */
export function OneSignalBridge({ userId }: { userId?: string | null }) {
  const initPromiseRef = useRef<Promise<void> | null>(null);
  /** 동일 사용자·구독 ID로 register/PATCH 중복 방지 */
  const lastRegisteredKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    if (!appId) {
      logClient("① 스킵: NEXT_PUBLIC_ONESIGNAL_APP_ID 없음");
      return;
    }

    const skipReason = oneSignalSkipInitReason();
    if (skipReason) {
      logClient("① 스킵 (출처)", { reason: skipReason });
      if (clientDebug()) {
        console.info("[OneSignal]", skipReason);
      }
      return;
    }

    logClient("① init 시작", { appId: `${appId.slice(0, 8)}…` });

    if (!initPromiseRef.current) {
      const safariWebId = process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID?.trim();

      initPromiseRef.current = OneSignal.init({
        appId,
        ...(safariWebId ? { safari_web_id: safariWebId } : {}),
        serviceWorkerPath: "/OneSignalSDKWorker.js",
        serviceWorkerParam: { scope: "/" },
        /** Chromium(Chrome·Edge·기타) 및 SW 지원 브라우저 공통. Safari(iOS/mac) 웹푸시는 대시보드 Safari Web ID + 사용자 OS 조건 필요 */
        allowLocalhostAsSecureOrigin: process.env.NODE_ENV === "development",
        welcomeNotification: { disable: true, message: "" },
        notifyButton: {
          enable: true,
          prenotify: false,
          showCredit: false,
          position: "bottom-right",
          size: "medium",
          text: {
            "dialog.blocked.message":
              "브라우저 설정에서 이 사이트의 알림을 허용해 주세요.",
            "dialog.blocked.title": "푸시 알림 차단됨",
            "dialog.main.button.subscribe": "알림 받기",
            "dialog.main.button.unsubscribe": "알림 끄기",
            "dialog.main.title": "알림 구독",
            "message.action.resubscribed": "다시 구독했습니다.",
            "message.action.subscribed": "알림을 구독했습니다.",
            "message.action.subscribing": "구독 처리 중…",
            "message.action.unsubscribed": "알림 구독을 해제했습니다.",
            "message.prenotify": "새 알림이 있습니다.",
            "tip.state.blocked": "알림이 차단됨",
            "tip.state.subscribed": "알림 수신 중",
            "tip.state.unsubscribed": "알림 미수신",
          },
        },
        promptOptions: {
          slidedown: {
            prompts: [
              {
                type: "push",
                autoPrompt: false,
                delay: { pageViews: 1, timeDelay: 0 },
              },
            ],
          },
        },
      })
        .then(() => {
          if (clientDebug() && OneSignal.Debug?.setLogLevel) {
            try {
              OneSignal.Debug.setLogLevel("debug");
            } catch {
              /* ignore */
            }
          }
          logClient("② init 완료", { serviceWorker: "/OneSignalSDKWorker.js" });
        })
        .catch((err) => {
          const msg = typeof err === "string" ? err : String(err?.message ?? err);
          if (msg.includes("already initialized")) {
            logClient("② init 이미 됨 (already initialized)");
            return undefined;
          }
          console.error("[OneSignal] init 실패:", err);
          throw err;
        });
    }
  }, []);

  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    if (!appId || !initPromiseRef.current) return;

    let cancelled = false;
    let debounceRegister: ReturnType<typeof setTimeout> | null = null;

    let reportStateOnce: (reason: string, force: boolean) => Promise<void>;

    const scheduleRegister = (reason: string) => {
      if (debounceRegister) clearTimeout(debounceRegister);
      debounceRegister = setTimeout(() => {
        debounceRegister = null;
        void reportStateOnce(reason, false);
      }, 2000);
    };

    reportStateOnce = async (reason: string, force: boolean) => {
      if (cancelled) return;
      try {
        const ext = OneSignal.User?.externalId ?? null;
        const optedIn = OneSignal.User?.PushSubscription?.optedIn ?? null;
        const { subscriptionId: subId, onesignalUserId: oneId } = await resolveIdsForBackend();
        /** DB·푸시는 기기마다 다른 Push 구독 ID만 저장. onesignalUserId 는 계정 단위로 동일해 다기기가 1개로 합쳐짐 */
        const playerForDb = subId?.trim() || null;
        const registerKey = `${userId ?? ""}|${playerForDb ?? ""}`;
        if (!playerForDb || !userId) {
          logClient(`⑧ Push 구독 ID 대기 (${reason})`, {
            optedIn,
            expectUserId: Boolean(userId),
            hasSubscriptionId: Boolean(subId),
            hasOnesignalUserId: Boolean(oneId),
          });
          if (userId) scheduleRegister(`retry-no-subscription:${reason}`);
          return;
        }
        if (!force && lastRegisteredKeyRef.current === registerKey) {
          logClient("⑧ register 스킵 (이미 동일 키)", { reason });
          return;
        }

        logClient(`⑧ 구독·Player ID (${reason})`, {
          subscriptionId: subId,
          onesignalUserId: oneId,
          playerForDb,
        });
        if (process.env.NODE_ENV === "production") {
          console.log("[OneSignal CRM bridge]", reason, {
            hasSubscriptionId: Boolean(subId),
            hasOnesignalUserId: Boolean(oneId),
          });
        }

        const regRes = await fetch("/api/user/onesignal-register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            subscriptionId: subId ?? "",
            onesignalUserId: oneId ?? "",
            externalId: ext ?? "",
          }),
        }).catch((e) => {
          console.error("[OneSignal] register API 실패", e);
          return null;
        });

        let registerSaved = false;
        if (regRes) {
          const regJson = (await regRes.json().catch(() => null)) as {
            ok?: boolean;
            skipped?: boolean;
            reason?: string;
            error?: string;
          } | null;
          if (verboseOsDebug()) {
            console.log("[OS DEBUG] onesignal-register 응답", {
              httpOk: regRes.ok,
              status: regRes.status,
              body: regJson,
            });
          }
          if (regRes.ok && regJson?.ok === true && !regJson?.skipped) {
            registerSaved = true;
          }
          if (!regRes.ok && clientDebug()) {
            console.warn("[OneSignal] register HTTP 실패", regRes.status, regJson);
          }
        }

        const patchRes = await fetch("/api/profile/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ playerId: playerForDb, oneSignalPlayerId: playerForDb }),
        }).catch((e) => {
          console.error("[OneSignal] profile playerId PATCH 실패", e);
          return null;
        });
        if (clientDebug() && patchRes && !patchRes.ok) {
          console.warn("[OneSignal] PATCH /api/profile/me", patchRes.status, await patchRes.text().catch(() => ""));
        }
        if (registerSaved) {
          lastRegisteredKeyRef.current = registerKey;
          clearProfileMeCache();
        }
      } catch (e) {
        console.error("[OneSignal] reportState 실패", e);
      }
    };

    void initPromiseRef.current.then(async () => {
      if (cancelled) return;
      try {
        if (userId) {
          lastRegisteredKeyRef.current = null;
          logClient("③ login 호출 전", { userId });
          await OneSignal.login(userId);
          logClient("④ login 완료 (external_id = User.id)", { userId });
          try {
            await OneSignal.Notifications?.requestPermission?.();
          } catch (permErr) {
            logClient("알림 권한 요청 실패/미지원", { err: String(permErr) });
          }
          try {
            await OneSignal.User?.PushSubscription?.optIn?.();
          } catch {
            /* ignore */
          }
          await new Promise((r) => setTimeout(r, 400));
          void reportStateOnce("login-initial", true);
          setTimeout(() => void reportStateOnce("login-deferred", false), 3500);
          for (const ms of [6000, 12_000, 20_000] as const) {
            setTimeout(() => void reportStateOnce(`login-retry-${ms}ms`, false), ms);
          }
          try {
            OneSignal.User?.PushSubscription?.addEventListener?.("change", () => {
              scheduleRegister("PushSubscription.change");
            });
          } catch {
            /* ignore */
          }
          try {
            OneSignal.User?.addEventListener?.("change", () => {
              scheduleRegister("User.change");
            });
          } catch {
            /* ignore */
          }
        } else {
          lastRegisteredKeyRef.current = null;
          logClient("③ logout (비로그인)");
          await OneSignal.logout();
        }
      } catch (e) {
        console.error("[OneSignal] login/logout 실패:", e);
      }
    });

    return () => {
      cancelled = true;
      if (debounceRegister) clearTimeout(debounceRegister);
    };
  }, [userId]);

  return null;
}
