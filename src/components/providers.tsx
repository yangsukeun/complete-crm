"use client";

import dynamic from "next/dynamic";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { useEffect } from "react";
import { SWRConfig } from "swr";
import { DeferredRealtimeBridges } from "@/components/deferred-realtime-bridges";
import { clearProfileMeCache } from "@/lib/profile-me-client";
import { UrlSearchModeBridge } from "@/components/url-search-mode-bridge";
import { WorkspaceThemeSync } from "@/components/workspace-switcher";
import { AIAssistProvider } from "@/components/ai-assist-context";
import { LayoutSharedProvider } from "@/components/layout-shared-context";
import { OneSignalPushTokenRegister } from "@/components/one-signal-push-token-register";
import type { HeaderBootstrapData, SwrLayoutFallback } from "@/lib/header-bootstrap";

const AIAssistFloat = dynamic(
  () => import("@/components/ai-assist-float").then((m) => m.AIAssistFloat),
  { ssr: false }
);

const FloatingChatPanel = dynamic(
  () => import("@/components/floating-chat-panel").then((m) => m.FloatingChatPanel),
  { ssr: false }
);

function ProfileMeCacheSync({ userId }: { userId?: string | null }) {
  useEffect(() => {
    if (!userId) clearProfileMeCache();
  }, [userId]);
  return null;
}

export function Providers({
  children,
  session,
  headerBootstrap,
  swrLayoutFallback,
}: {
  children: React.ReactNode;
  session?: Session | null;
  /** [PERF-3차] layout RSC 1회 조회 — /api/mode·logo·unread-count 클라 중복 완화 */
  headerBootstrap: HeaderBootstrapData;
  /** [PERF-mode-logo] layout RSC 스냅샷 — 키는 `SWR_MODE_KEY`·`SWR_LOGO_SETTINGS_KEY`·`SWR_KEYS.notificationUnread`와 동일 */
  swrLayoutFallback: SwrLayoutFallback;
}) {
  return (
    <SessionProvider
      basePath="/api/auth"
      session={session ?? undefined}
      refetchInterval={0}
      refetchOnWindowFocus={false}
    >
      <SWRConfig
        value={{
          // [PERF-mode-logo] mode/logo 키는 fallback만 사용 — 각 훅에서 revalidateOnMount는 별도 지정
          fallback: swrLayoutFallback as Record<string, unknown>,
          dedupingInterval: 30_000,
          revalidateOnFocus: false,
          revalidateOnReconnect: true,
          focusThrottleInterval: 60_000,
          errorRetryCount: 2,
        }}
      >
        <LayoutSharedProvider initial={headerBootstrap}>
          <ProfileMeCacheSync userId={session?.user?.id} />
          <OneSignalPushTokenRegister />
          <DeferredRealtimeBridges userId={session?.user?.id} />
          <AIAssistProvider>
            <UrlSearchModeBridge />
            <WorkspaceThemeSync />
            {children}
            {session?.user && <AIAssistFloat />}
            {session?.user && <FloatingChatPanel />}
          </AIAssistProvider>
        </LayoutSharedProvider>
      </SWRConfig>
    </SessionProvider>
  );
}
