"use client";

import dynamic from "next/dynamic";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { useEffect } from "react";
import { SWRConfig } from "swr";
import { OneSignalBridge } from "@/components/one-signal-bridge";
import { SupabaseRealtimeBridge } from "@/components/supabase-realtime-bridge";
import { clearProfileMeCache } from "@/lib/profile-me-client";
import { WorkspaceThemeSync } from "@/components/workspace-switcher";
import { AIAssistProvider } from "@/components/ai-assist-context";

const AIAssistFloat = dynamic(
  () => import("@/components/ai-assist-float").then((m) => m.AIAssistFloat),
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
}: {
  children: React.ReactNode;
  session?: Session | null;
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
          dedupingInterval: 5000,
          revalidateOnFocus: true,
          focusThrottleInterval: 10_000,
          errorRetryCount: 2,
        }}
      >
        <ProfileMeCacheSync userId={session?.user?.id} />
        <OneSignalBridge userId={session?.user?.id} />
        <SupabaseRealtimeBridge />
        <AIAssistProvider>
          <WorkspaceThemeSync />
          {children}
          {session?.user && <AIAssistFloat />}
        </AIAssistProvider>
      </SWRConfig>
    </SessionProvider>
  );
}
