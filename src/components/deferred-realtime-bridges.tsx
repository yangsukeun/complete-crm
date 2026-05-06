"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SupabaseRealtimeBridge } from "@/components/supabase-realtime-bridge";

const OneSignalBridge = dynamic(
  () => import("@/components/one-signal-bridge").then((m) => ({ default: m.OneSignalBridge })),
  { ssr: false }
);

function isPublicAuthPathname(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === "/login" || pathname === "/signup") return true;
  return pathname.startsWith("/login/");
}

/**
 * Supabase Realtime(채팅·자금·presence)은 hydration 직후 즉시 마운트 — idle 지연 시 채팅방에서 수 초간 구독 없음.
 * OneSignal만 requestIdleCallback 으로 늦춰 메인 스레드·푸시 초기화 경합을 완화.
 */
export function DeferredRealtimeBridges({ userId }: { userId?: string | null }) {
  const pathname = usePathname();
  const publicAuth = isPublicAuthPathname(pathname);
  const [oneSignalReady, setOneSignalReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let idleHandle: number | undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const arm = () => {
      if (!cancelled) setOneSignalReady(true);
    };

    /**
     * 로그인·가입 등 공개 인증 화면에서 세션이 없을 때는 OneSignal을 켜지 않음.
     * 그렇지 않으면 idle 후 init → 익명 플레이어 동기화·logout 경로에서 api.onesignal.com 404·콘솔 오류가 반복됨.
     */
    if (publicAuth && !userId) {
      setOneSignalReady(false);
      return () => {
        cancelled = true;
      };
    }

    /** 로그인 세션이 있으면 푸시 init·구독 준비를 기다리지 않고 즉시 마운트(토큰 등록 타이밍 문제 방지) */
    if (userId) {
      arm();
      return () => {
        cancelled = true;
      };
    }

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
  }, [userId, publicAuth]);

  return (
    <>
      <SupabaseRealtimeBridge />
      {oneSignalReady ? <OneSignalBridge userId={userId} /> : null}
    </>
  );
}
