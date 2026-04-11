"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";

/**
 * 탭이 보이는 동안 주기적으로 lastActiveAt 갱신 — 푸시 시 "CRM 앞에 없음" 판단용.
 */
export function PresenceHeartbeat() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading" || !session?.user?.id) return;

    const ping = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void fetch("/api/users/heartbeat", { method: "POST", credentials: "include" }).catch(() => {
        /* */
      });
    };

    ping();
    const interval = window.setInterval(ping, 45_000);
    const onVis = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [session?.user?.id, status]);

  return null;
}
