"use client";

import { useEffect, useRef } from "react";
import OneSignal from "react-onesignal";
import { originsEquivalentForSiteUrl } from "@/lib/onesignal/origin-match";

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

/** SDK 타이밍 완화(권한·구독 ID 준비 대기) */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * OneSignal v16 — init만으로 구독 ID가 안 붙는 환경용: 권한 확인 → 필요 시 요청 → 명시적 optIn(재시도).
 * react-onesignal 패키지의 `OneSignal` 싱글톤 사용(Deferred 안에서 os.init 재호출 안 함).
 */
async function runExplicitPushOptIn(reason: string): Promise<void> {
  const N = OneSignal.Notifications as
    | {
        permission?: boolean;
        requestPermission?: () => Promise<unknown>;
        getPermissionAsync?: () => Promise<string | boolean>;
      }
    | undefined;
  const Sub = OneSignal.User?.PushSubscription as { optIn?: () => Promise<void> } | undefined;
  if (!Sub?.optIn) {
    logClient("[OS] optIn 스킵: API 없음", { reason });
    return;
  }

  let browserGranted = typeof Notification !== "undefined" && Notification.permission === "granted";
  let osGranted = false;
  try {
    if (typeof N?.permission === "boolean") osGranted = N.permission;
    else if (typeof N?.getPermissionAsync === "function") {
      const p = await N.getPermissionAsync().catch(() => "default");
      osGranted = p === true || p === "granted";
    }
  } catch {
    /* */
  }

  if (!osGranted && !browserGranted) {
    try {
      await N?.requestPermission?.();
    } catch (e) {
      logClient("[OS] requestPermission 예외", { reason, err: String(e) });
    }
    await sleep(300);
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await Sub.optIn();
      logClient("[OS] optIn 완료", { reason, attempt });
    } catch (e) {
      logClient("[OS] optIn 실패", { reason, attempt, err: String(e) });
    }
    if (attempt === 1) await sleep(700);
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
    const expectedOrigin = new URL(configured).origin;
    const current = window.location.origin;
    if (!originsEquivalentForSiteUrl(current, expectedOrigin)) {
      return `현재 ${current} — 설정 출처는 ${expectedOrigin} 입니다(www/apex는 동일 사이트로 봄). Vercel 프리뷰 등이면 대시보드에 해당 출처를 추가하거나 NEXT_PUBLIC_ONESIGNAL_APP_ID 를 비워 주세요.`;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * 브라우저에서 OneSignal을 한 번 초기화하고, 로그인 시 알림 권한·optIn 을 처리합니다.
 * `OneSignal.login(User.id)` 는 일부 환경에서 예외가 날 수 있어 try/catch·타임아웃으로만 호출합니다(다기기·external_id 정렬).
 * 푸시 발송은 DB에 저장된 구독 ID(`include_subscription_ids`)를 우선 사용합니다.
 * 구독 ID 서버 등록은 `OneSignalPushTokenRegister`(providers)에서 수행합니다.
 *
 * 연결 위치: app/layout.tsx → Providers (`src/components/providers.tsx`) 안에서 마운트됨. (_app.tsx 없음, App Router)
 */
export function OneSignalBridge({ userId }: { userId?: string | null }) {
  const initPromiseRef = useRef<Promise<void> | null>(null);

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

      const initObject: Parameters<typeof OneSignal.init>[0] = {
        appId,
        ...(safariWebId ? { safari_web_id: safariWebId } : {}),
        serviceWorkerPath: "/OneSignalSDKWorker.js",
        serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js",
        serviceWorkerParam: { scope: "/" },
        // 푸시 클릭 시 탭 폭발 방지: 같은 origin 탭을 포커스(가능하면)하고, 새 탭은 최소화
        notificationClickHandlerMatch: "origin",
        notificationClickHandlerAction: "focus",
        /** Chromium(Chrome·Edge·기타) 및 SW 지원 브라우저 공통. Safari(iOS/mac) 웹푸시는 대시보드 Safari Web ID + 사용자 OS 조건 필요 */
        allowLocalhostAsSecureOrigin: process.env.NODE_ENV === "development",
        welcomeNotification: { disable: true, message: "" },
        /** 벨 UI 비활성 — SW/구독 초기화와 UI 프롬프트 경합 완화 (text 는 타입 필수) */
        notifyButton: {
          enable: false,
          prenotify: false,
          showCredit: false,
          text: {
            "dialog.blocked.message": "브라우저 설정에서 이 사이트의 알림을 허용해 주세요.",
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
      };

      if (verboseOsDebug()) {
        console.log("[OS DEBUG] OneSignal.init 설정", {
          appIdTail: String(appId).slice(-8),
          safariWebId: safariWebId ? `${safariWebId.slice(0, 6)}…` : null,
          allowLocalhostAsSecureOrigin: initObject.allowLocalhostAsSecureOrigin,
          serviceWorkerPath: initObject.serviceWorkerPath,
          serviceWorkerScope: initObject.serviceWorkerParam?.scope ?? null,
          origin: typeof window !== "undefined" ? window.location.origin : null,
        });
      }

      initPromiseRef.current = (async () => {
        try {
          /** 모바일 등에서 SDK 등록 전 SW=0인 경우 완화 — 호스트 워커를 먼저 등록 후 init */
          if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
            try {
              // 우리 SW는 OneSignal 워커와 별개(일반 notificationclick 포커스/NAVIGATE 브리지용)
              try {
                await navigator.serviceWorker.register("/sw.js", { scope: "/" });
              } catch {
                /* ignore */
              }
              const reg = await navigator.serviceWorker.register("/OneSignalSDKWorker.js", { scope: "/" });
              const swState =
                reg.installing?.state ?? reg.waiting?.state ?? reg.active?.state ?? "pending";
              logClient("① SW 사전 등록", { scope: reg.scope, state: swState });
              if (clientDebug()) {
                console.log("[OneSignal SW] pre-register OK", reg.scope, swState);
              }
            } catch (swErr: unknown) {
              logClient("① SW 사전 등록 실패(SDK에 맡김)", { err: String(swErr) });
              if (clientDebug()) {
                console.warn("[OneSignal SW] pre-register failed", swErr);
              }
            }
          }

          await OneSignal.init(initObject);
          if (clientDebug() && OneSignal.Debug?.setLogLevel) {
            try {
              OneSignal.Debug.setLogLevel("debug");
            } catch {
              /* ignore */
            }
          }
          logClient("② init 완료", { serviceWorker: "/OneSignalSDKWorker.js" });
          await sleep(400);
          await runExplicitPushOptIn("init 직후");
        } catch (err: unknown) {
          const msg = typeof err === "string" ? err : String((err as Error)?.message ?? err);
          if (msg.includes("already initialized")) {
            logClient("② init 이미 됨 (already initialized)");
            return;
          }
          if (process.env.NODE_ENV === "development") {
            console.debug("[OneSignal] init 실패:", err);
          }
        }
      })();
    }
  }, []);

  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    if (!appId || !initPromiseRef.current) return;

    let cancelled = false;

    void initPromiseRef.current.then(async () => {
      if (cancelled) return;
      try {
        if (userId) {
          logClient("③ 로그인 세션 — login 후 명시적 optIn (토큰 등록은 OneSignalPushTokenRegister)", { userId });
          await sleep(400);
          try {
            await OneSignal.Notifications?.requestPermission?.();
          } catch (permErr) {
            logClient("알림 권한 요청 실패/미지원", { err: String(permErr) });
          }
          try {
            const loginFn = (OneSignal as { login?: (externalId: string) => Promise<void> }).login;
            if (typeof loginFn === "function") {
              await Promise.race([
                loginFn.call(OneSignal, userId),
                new Promise<void>((_, reject) => setTimeout(() => reject(new Error("login-timeout")), 8000)),
              ]).catch(() => {
                /* SDK 버전별 무시 */
              });
            }
          } catch {
            /* ignore */
          }
          await sleep(500);
          await runExplicitPushOptIn("login 후");
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("crm-onesignal-session-ready", { detail: { userId } }));
          }
        } else {
          logClient("③ logout (비로그인)");
          try {
            await OneSignal.logout();
          } catch (e) {
            if (process.env.NODE_ENV === "development") {
              console.debug("[OneSignal] logout 실패:", e);
            }
          }
        }
      } catch (e) {
        if (process.env.NODE_ENV === "development") {
          console.debug("[OneSignal] 세션 흐름 예외:", e);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return null;
}
