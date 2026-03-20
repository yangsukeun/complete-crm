"use client";

import { useEffect, useRef } from "react";
import OneSignal from "react-onesignal";

/**
 * 브라우저에서 OneSignal을 한 번 초기화하고, 로그인 시 external_id(User.id)와 맞춥니다.
 * 서버 푸시(`include_aliases.external_id`)와 동일한 값이어야 합니다.
 */
export function OneSignalBridge({ userId }: { userId?: string | null }) {
  const initPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    if (!appId) return;

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
        .then(() => undefined)
        .catch((err) => {
          const msg = typeof err === "string" ? err : String(err?.message ?? err);
          if (msg.includes("already initialized")) {
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

    void initPromiseRef.current.then(async () => {
      if (cancelled) return;
      try {
        if (userId) {
          await OneSignal.login(userId);
        } else {
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
