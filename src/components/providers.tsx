"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { WorkspaceThemeSync } from "@/components/workspace-switcher";
import { AIAssistProvider } from "@/components/ai-assist-context";
import { AIAssistFloat } from "@/components/ai-assist-float";

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
      <AIAssistProvider>
        <WorkspaceThemeSync />
        {children}
        {session?.user && <AIAssistFloat />}
      </AIAssistProvider>
    </SessionProvider>
  );
}
