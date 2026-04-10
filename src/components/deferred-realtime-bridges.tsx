"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { SupabaseRealtimeBridge } from "@/components/supabase-realtime-bridge";

const OneSignalBridge = dynamic(
  () => import("@/components/one-signal-bridge").then((m) => ({ default: m.OneSignalBridge })),
  { ssr: false }
);

/**
 * Supabase Realtime(채팅·자금·presence)은 hydration 직후 즉시 마운트 — idle 지연 시 채팅방에서 수 초간 구독 없음.
 * OneSignal만 requestIdleCallback 으로 늦춰 메인 스레드·푸시 초기화 경합을 완화.
 */
export function DeferredRealtimeBridges({ userId }: { userId?: string | null }) {
  const [oneSignalReady, setOneSignalReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let idleHandle: number | undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const arm = () => {
      if (!cancelled) setOneSignalReady(true);
    };

    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(arm, { timeout: 2800 });
    } else {
      timeoutHandle = setTimeout(arm, 1500);
    }

    return () => {
      cancelled = true;
      if (idleHandle !== undefined && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    };
  }, []);

  return (
    <>
      <SupabaseRealtimeBridge />
      {oneSignalReady ? <OneSignalBridge userId={userId} /> : null}
    </>
  );
}
