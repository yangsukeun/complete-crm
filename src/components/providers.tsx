"use client";

import dynamic from "next/dynamic";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { WorkspaceThemeSync } from "@/components/workspace-switcher";
import { AIAssistProvider } from "@/components/ai-assist-context";

const AIAssistFloat = dynamic(
  () => import("@/components/ai-assist-float").then((m) => m.AIAssistFloat),
  { ssr: false }
);

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
