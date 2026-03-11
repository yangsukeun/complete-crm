"use client";

import { useEffect, useRef } from "react";
import OneSignal from "react-onesignal";

export function OneSignalInit() {
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    (async () => {
      try {
        await OneSignal.init({
          appId: "12345678-abcd-1234-abcd-1234567890ab",
          allowLocalhostAsSecureOrigin: true,
        });
        await OneSignal.Slidedown.promptPush();
      } catch (e) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[OneSignal] init failed", e);
        }
      }
    })();
  }, []);

  return null;
}
