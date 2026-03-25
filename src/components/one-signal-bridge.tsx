"use client";

import { useEffect, useRef } from "react";
import OneSignal from "react-onesignal";

function clientDebug(): boolean {
  return (
    typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_DEBUG_ONESIGNAL === "1" || process.env.NODE_ENV === "development")
  );
}

function logClient(step: string, payload?: Record<string, unknown>) {
  if (clientDebug()) {
    console.log(`[OneSignal client] ${step}`, payload ?? "");
  }
}

/**
 * 브라우저에서 OneSignal을 한 번 초기화하고, 로그인 시 external_id(User.id)와 맞춥니다.
 * 서버 푸시(`include_aliases.external_id`)와 동일한 값이어야 합니다.
 *
 * 연결 위치: app/layout.tsx → Providers (`src/components/providers.tsx`) 안에서 마운트됨. (_app.tsx 없음, App Router)
 */
export function OneSignalBridge({ userId }: { userId?: string | null }) {
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const reportedRef = useRef(false);

  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    if (!appId) {
      logClient("① 스킵: NEXT_PUBLIC_ONESIGNAL_APP_ID 없음");
      return;
    }

    logClient("① init 시작", { appId: `${appId.slice(0, 8)}…` });

    if (!initPromiseRef.current) {
      initPromiseRef.current = OneSignal.init({
        appId,
        serviceWorkerPath: "/OneSignalSDKWorker.js",
        serviceWorkerParam: { scope: "/" },
        allowLocalhostAsSecureOrigin: process.env.NODE_ENV === "development",
        welcomeNotification: { disable: true, message: "" },
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

    const reportState = async (reason: string) => {
      if (cancelled) return;
      try {
        const ext = OneSignal.User?.externalId ?? null;
        const oneId = OneSignal.User?.onesignalId ?? null;
        const subId = OneSignal.User?.PushSubscription?.id ?? null;
        const optedIn = OneSignal.User?.PushSubscription?.optedIn ?? null;
        let legacyUserId: string | null = null;
        try {
          const os = OneSignal as unknown as { getUserId?: () => Promise<string | null | undefined> };
          if (typeof os.getUserId === "function") {
            legacyUserId = (await os.getUserId().catch(() => null)) ?? null;
          }
        } catch {
          /* ignore */
        }
        const playerForDb = (subId || oneId || legacyUserId)?.trim() || null;
        logClient(`⑧ 구독 상태 (${reason})`, {
          externalId: ext,
          onesignalUserId: oneId,
          subscriptionId: subId,
          optedIn,
          legacyUserId,
          expectExternalIdMatchUserId: userId ?? null,
        });

        if (subId || oneId || legacyUserId) {
          await fetch("/api/user/onesignal-register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscriptionId: subId ?? "",
              onesignalUserId: oneId ?? "",
              externalId: ext ?? "",
            }),
          }).catch((e) => console.error("[OneSignal] register API 실패", e));
        }

        if (playerForDb && userId) {
          await fetch("/api/profile/me", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ oneSignalPlayerId: playerForDb }),
          }).catch((e) => console.error("[OneSignal] profile playerId PATCH 실패", e));
        }
      } catch (e) {
        console.error("[OneSignal] reportState 실패", e);
      }
    };

    void initPromiseRef.current.then(async () => {
      if (cancelled) return;
      try {
        if (userId) {
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
          reportedRef.current = false;
          setTimeout(() => void reportState("login+1.5s"), 1500);
          try {
            OneSignal.User?.PushSubscription?.addEventListener?.("change", () => {
              void reportState("PushSubscription.change");
            });
          } catch {
            /* ignore */
          }
        } else {
          logClient("③ logout (비로그인)");
          await OneSignal.logout();
        }
      } catch (e) {
        console.error("[OneSignal] login/logout 실패:", e);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return null;
}
