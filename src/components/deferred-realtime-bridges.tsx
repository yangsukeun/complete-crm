"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const OneSignalBridge = dynamic(
  () => import("@/components/one-signal-bridge").then((m) => ({ default: m.OneSignalBridge })),
  { ssr: false }
);

const SupabaseRealtimeBridge = dynamic(
  () =>
    import("@/components/supabase-realtime-bridge").then((m) => ({
      default: m.SupabaseRealtimeBridge,
    })),
  { ssr: false }
);

/**
 * 첫 페인트·hydration 이후 브라우저 여유 시점에 실시간/푸시 초기화 → 메인 스레드·네트워크 경합 완화.
 */
export function DeferredRealtimeBridges({ userId }: { userId?: string | null }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let idleHandle: number | undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const arm = () => {
      if (!cancelled) setReady(true);
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

  if (!ready) return null;

  return (
    <>
      <OneSignalBridge userId={userId} />
      <SupabaseRealtimeBridge />
    </>
  );
}
